// =====================================================================
// v2 Call Workflow — startCall + processTurn
// processTurn 检测 is_call_ending=true 时标记 ending + emit event
// 不同步执行完整 post-call 分析
// =====================================================================
import * as contextService from "../services/context.service";
import * as safetyService from "../services/safety.service";
import * as callSessionService from "../services/call-session.service";
import { planCallTurn } from "../cognitive/call-turn-engine";
import { buildCallPlan } from "../cognitive/call-plan-builder";
import { orchestrateTurn } from "./turn-orchestrator";
import { isV21CallEnabled } from "./feature-flag";
import * as eventBus from "../services/event-bus.service";
import { store } from "../store/memory-store";
import type { WorkflowResult, SafetyPolicy } from "../store/types";

export type StartCallParams = {
  taskOccurrenceId: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  phone: string;
  provider: string;
  taskTemplate: Record<string, unknown>;
};

export type ProcessTurnParams = {
  sessionId: string;
  elderUtterance: string;
  elderId: string;
  caregiverId: string;
  /** v2.1 传递任务模板信息 */
  taskTemplate?: Record<string, unknown>;
};

/**
 * 开始通话：初始化 session + 生成通话计划 + 模板化开场白
 */
export async function startCall(params: StartCallParams): Promise<WorkflowResult> {
  const ctx = contextService.forCall(
    params.elderId,
    params.caregiverId,
    []
  );

  // preCheck
  const preCheck = safetyService.preCheck("");
  const constraints = safetyService.policyConstraint(preCheck.safetyPolicy);

  // 生成通话计划
  const callPlan = await buildCallPlan({
    familyContext: ctx.serialized,
    safetyPolicy: preCheck.safetyPolicy,
    policyConstraints: constraints,
    taskTemplate: params.taskTemplate,
  });

  // v2.1 身份锁定：获取长辈和子女信息
  const elder = store.getElder(params.elderId);
  const caregiver = store.getCaregiver(params.caregiverId);

  // 初始化 CallSession
  const session = callSessionService.init({
    taskOccurrenceId: params.taskOccurrenceId,
    familyId: params.familyId,
    elderId: params.elderId,
    caregiverId: params.caregiverId,
    phone: params.phone,
    provider: params.provider,
    // v2.1 身份锁定字段
    caregiverDisplayName: caregiver?.displayName ?? "",
    elderDisplayName: elder?.displayName ?? "",
    elderRelation: elder?.relation ?? "",
    callPlan: {
      callPlanId: `cp_${Date.now()}`,
      maxDurationSeconds: 240,
      maxExtraQuestions: 2,
      stages: callPlan.stages.map((s) => ({
        stage: s.stage as any,
        goal: s.goal,
        sampleScript: s.sample_script,
      })),
    },
  });

  // 模板化开场白
  const openingStage = callPlan.stages.find(
    (s) => s.stage === "identity_and_consent"
  );
  const opening =
    openingStage?.sample_script ??
    "您好，我是念念，是家人设置的亲情小助理。";

  // 记录开场白
  callSessionService.appendTranscript(session.id, {
    speaker: "assistant",
    text: opening,
    stage: "identity_and_consent",
    timestamp: new Date().toISOString(),
  });

  callSessionService.updateStatus(session.id, "connected");

  return {
    kind: "call_turn",
    content: opening,
    data: {
      sessionId: session.id,
      callPlan,
    },
    safetyPolicy: preCheck.safetyPolicy,
  };
}

/**
 * 处理通话轮次
 * processTurn 检测 is_call_ending=true 时标记 ending + emit event
 * **不同步执行完整 post-call 分析**
 */
export async function processTurn(params: ProcessTurnParams): Promise<WorkflowResult> {
  const { sessionId, elderUtterance, elderId, caregiverId } = params;

  const session = callSessionService.load(sessionId);
  if (!session) {
    return { kind: "error", content: "通话 session 不存在" };
  }

  // 记录长辈发言
  callSessionService.appendTranscript(sessionId, {
    speaker: "elder",
    text: elderUtterance,
    stage: session.conversationState.stage,
    timestamp: new Date().toISOString(),
  });

  // 上下文
  const ctx = contextService.forCall(elderId, caregiverId);

  // 安全策略
  const preCheck = safetyService.preCheck(elderUtterance);
  const constraints = safetyService.policyConstraint(preCheck.safetyPolicy);

  // transcript 字符串
  const transcript = callSessionService.getFullTranscript(sessionId);

  // --- v2.1 三步编排 vs v2 一步到位 ---
  let finalText: string;
  let isCallEnding: boolean;
  let observations: any[];
  let analysisData: Record<string, unknown> | undefined;
  let finalStage: string;

  if (isV21CallEnabled()) {
    // ================================================================
    // v2.1 三步编排：UnderstandTurn → DecideNextAction → GenerateReply
    // ================================================================
    const identity = callSessionService.getIdentityLock(sessionId);
    const taskContext = JSON.stringify(params.taskTemplate ?? session.callPlan ?? {});

    const result = await orchestrateTurn({
      sessionId,
      elderUtterance,
      currentState: session.conversationState,
      familyContext: ctx.serialized,
      transcript,
      taskContext,
      safetyPolicy: preCheck.safetyPolicy,
      policyConstraints: constraints,
      caregiverDisplayName: identity.caregiverDisplayName || "家人",
      elderDisplayName: identity.elderDisplayName || "阿姨",
      elderRelation: identity.elderRelation || "长辈",
    });

    finalText = result.replyText;
    isCallEnding = result.shouldEndCall;
    observations = result.observations;
    analysisData = {
      intent: result.intent.intent,
      confidence: result.intent.confidence,
      evidence: result.intent.evidence,
      validation: result.decision.validation,
      replySource: result.replySource,
    };
    finalStage = result.finalStage;

    // 应用 state_patch
    callSessionService.applyStatePatch(sessionId, {
      taskSlots: result.statePatch.task_slots as any,
      relationshipSlots: result.statePatch.relationship_slots as any,
      probeBudget: result.statePatch.probe_budget as any,
      elderWillingness: result.statePatch.elder_willingness,
      shouldCloseSoon: result.statePatch.should_close_soon,
      stage: finalStage as any,
      turnCount: session.conversationState.turnCount + 1,
    });
  } else {
    // ================================================================
    // v2 一步到位（旧模式）
    // ================================================================
    const turnResult = await planCallTurn({
      elderUtterance,
      transcript,
      callState: session.conversationState as any,
      familyContext: ctx.serialized,
      safetyPolicy: preCheck.safetyPolicy,
      policyConstraints: constraints,
    });

    // SafetyService.postCheck
    const safetyCheck = safetyService.postCheck(turnResult.next.assistant_text);
    finalText =
      safetyCheck.action === "block"
        ? safetyCheck.sanitizedText
        : safetyCheck.action === "sanitize"
          ? safetyCheck.sanitizedText
          : turnResult.next.assistant_text;

    isCallEnding = turnResult.next.is_call_ending;
    observations = turnResult.observations;
    analysisData = turnResult.analysis;
    finalStage = turnResult.next.stage;

    // 应用 state_patch
    callSessionService.applyStatePatch(sessionId, {
      taskSlots: turnResult.state_patch.task_slots,
      relationshipSlots: turnResult.state_patch.relationship_slots,
      probeBudget: turnResult.state_patch.probe_budget as any,
      elderWillingness: turnResult.state_patch.elder_willingness,
      shouldCloseSoon: turnResult.state_patch.should_close_soon,
      stage: turnResult.next.stage as any,
      turnCount: session.conversationState.turnCount + 1,
    });
  }

  // 记录 assistant 回复
  callSessionService.appendTranscript(sessionId, {
    speaker: "assistant",
    text: finalText,
    stage: finalStage as any,
    timestamp: new Date().toISOString(),
  });

  // **检测 is_call_ending=true：标记 ending + emit event，不同步跑 post-call**
  if (isCallEnding) {
    callSessionService.updateStatus(sessionId, "ended");

    const event = eventBus.createEvent({
      type: "call.ended",
      idempotencyKey: `call.ended:${sessionId}`,
      payload: { sessionId, elderId, caregiverId },
    });
    await eventBus.emit(event);
  }

  return {
    kind: "call_turn",
    content: finalText,
    data: {
      sessionId,
      isCallEnding,
      observations,
      analysis: analysisData,
    },
    observations,
    safetyPolicy: preCheck.safetyPolicy,
  };
}
