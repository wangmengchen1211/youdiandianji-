// =====================================================================
// v2.1 Turn Orchestrator — 三步编排
// UnderstandTurn → DecideNextAction → GenerateReply
// 替代旧 planCallTurn 的一步到位模式
// =====================================================================
import { classifyTurnIntent } from "../cognitive/turn-intent-classifier";
import { decideNextAction } from "../cognitive/action-decider";
import { generateReply } from "../cognitive/reply-generator";
import { turnLogger, type TurnLogEntry } from "../services/turn-logger.service";
import * as callSessionService from "../services/call-session.service";
import * as safetyService from "../services/safety.service";
import type { ConversationState, CallStage } from "../store/types";
import type { FinalDecisionOutput } from "../schemas/action-decision.schema";
import type { TurnIntentOutput } from "../schemas/turn-intent.schema";

export type TurnOrchestrationResult = {
  /** 最终回复话术 */
  replyText: string;
  /** 回复来源 */
  replySource: "llm" | "fallback";
  /** 最终决策 */
  decision: FinalDecisionOutput;
  /** 意图识别结果 */
  intent: TurnIntentOutput;
  /** 是否结束通话 */
  shouldEndCall: boolean;
  /** 观察记录 */
  observations: FinalDecisionOutput["observations"];
  /** 状态 patch */
  statePatch: FinalDecisionOutput["state_patch"];
  /** 最终阶段 */
  finalStage: string;
};

/**
 * 三步编排：UnderstandTurn → DecideNextAction → GenerateReply
 */
export async function orchestrateTurn(params: {
  sessionId: string;
  elderUtterance: string;
  currentState: ConversationState;
  familyContext: string;
  transcript: string;
  taskContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
  caregiverDisplayName: string;
  elderDisplayName: string;
  elderRelation: string;
}): Promise<TurnOrchestrationResult> {
  const {
    sessionId,
    elderUtterance,
    currentState,
    familyContext,
    transcript,
    taskContext,
    safetyPolicy,
    policyConstraints,
    caregiverDisplayName,
    elderDisplayName,
    elderRelation,
  } = params;

  const stageBefore = currentState.stage;

  // ================================================================
  // Step 1: UnderstandTurn — 意图识别
  // ================================================================
  const intent = await classifyTurnIntent({
    elderUtterance,
    currentStage: stageBefore,
    taskContext,
    caregiverDisplayName,
    elderDisplayName,
  });

  // ================================================================
  // Step 2: DecideNextAction — LLM 提议 + 状态机校验
  // ================================================================
  const decision = await decideNextAction({
    intent,
    currentState,
    familyContext,
    transcript,
    elderUtterance,
    safetyPolicy: safetyPolicy.join(", "),
    policyConstraints: policyConstraints.join("\n"),
    caregiverDisplayName,
    elderDisplayName,
    taskContext,
  });

  // ================================================================
  // Step 3: GenerateReply — 自然话术生成
  // ================================================================
  const safetyConstraints = policyConstraints.join("\n");
  const transcriptTail = transcript.split("\n").slice(-6).join("\n");

  const { text: replyText, source: replySource } = await generateReply({
    decision,
    elderUtterance,
    transcriptTail,
    familyContext,
    caregiverDisplayName,
    elderDisplayName,
    elderRelation,
    safetyConstraints,
  });

  // --- SafetyService.postCheck ---
  const safetyCheck = safetyService.postCheck(replyText);
  const finalText =
    safetyCheck.action === "block"
      ? safetyCheck.sanitizedText
      : safetyCheck.action === "sanitize"
        ? safetyCheck.sanitizedText
        : replyText;

  // --- 记录日志 ---
  const logEntry: TurnLogEntry = {
    timestamp: Date.now(),
    rawASR: elderUtterance,
    normalizedText: elderUtterance.trim().replace(/\s+/g, ""),
    stageBefore,
    turnCount: currentState.turnCount,
    intent: intent.intent,
    intentConfidence: intent.confidence,
    intentEvidence: intent.evidence,
    negationDetected: intent.negation_detected,
    emotionDetected: intent.emotion_detected,
    proposedStage: decision.final_stage, // 最终提议（校验后）
    proposedAction: decision.final_action,
    stageAfter: decision.final_stage,
    validationPassed: decision.validation.passed,
    overrideReason: decision.validation.override_reason,
    hardLimitHit: decision.validation.hard_limit_hit,
    assistantReply: finalText,
    replySource,
    endReason: decision.should_end_call
      ? decision.validation.override_reason || "LLM 决定结束"
      : undefined,
  };

  turnLogger.log(sessionId, logEntry);

  return {
    replyText: finalText,
    replySource,
    decision,
    intent,
    shouldEndCall: decision.should_end_call,
    observations: decision.observations,
    statePatch: decision.state_patch,
    finalStage: decision.final_stage as CallStage,
  };
}
