// =====================================================================
// v2 Post-call Workflow（必须幂等）
// CallSessionService.loadFullTranscript → PostCallExtractor
// → MemoryInsightWriter → MemoryService → CareInsightService → EventBus
// =====================================================================
import * as callSessionService from "../services/call-session.service";
import * as safetyService from "../services/safety.service";
import { extractPostCall } from "../cognitive/post-call-extractor";
import { writeMemoryAndInsight } from "../cognitive/memory-insight-writer";
import * as contextService from "../services/context.service";
import * as eventBus from "../services/event-bus.service";
import { store } from "../store/memory-store";
import { saveCareInsight } from "../services/care-insight-service";
import type { WorkflowResult, Memory } from "../store/types";

export type PostCallWorkflowParams = {
  sessionId: string;
  elderId: string;
  caregiverId: string;
};

/**
 * 通话后分析（必须幂等）
 */
export async function handle(params: PostCallWorkflowParams): Promise<WorkflowResult> {
  const { sessionId, elderId, caregiverId } = params;

  // --- 幂等检查 ---
  const postCallStatus = callSessionService.getPostCallStatus(sessionId);
  if (postCallStatus === "completed") {
    return {
      kind: "post_call",
      content: "通话分析已完成",
      data: { status: "already_completed" },
    };
  }
  if (postCallStatus === "processing") {
    return {
      kind: "post_call",
      content: "通话分析正在处理中",
      data: { status: "processing" },
    };
  }

  // 标记处理中
  callSessionService.setPostCallStatus(sessionId, "processing");

  try {
    const session = callSessionService.load(sessionId);
    if (!session) {
      callSessionService.setPostCallStatus(sessionId, "failed");
      return { kind: "error", content: "通话 session 不存在" };
    }

    const transcript = callSessionService.getFullTranscript(sessionId);
    const ctx = contextService.forPostCall(elderId, caregiverId);

    // SafetyService.preCheck
    const preCheck = safetyService.preCheck("");
    const constraints = safetyService.policyConstraint(preCheck.safetyPolicy);

    // 1. PostCallExtractor
    const extraction = await extractPostCall({
      transcript,
      callState: session.conversationState as any,
      familyContext: ctx.serialized,
      safetyPolicy: preCheck.safetyPolicy,
      policyConstraints: constraints,
    });

    // 2. MemoryInsightWriter（合并记忆 + 洞察）
    const memoryResult = await writeMemoryAndInsight({
      transcript,
      familyContext: ctx.serialized,
      safetyPolicy: preCheck.safetyPolicy,
      policyConstraints: constraints,
      taskResult: extraction.task_result,
    });

    // 3. 保存记忆候选（基于 source_id 去重）
    const existingSourceIds = new Set(
      store.getMemories(elderId).map((m) => m.sourceId).filter(Boolean)
    );

    for (const mc of memoryResult.memory_candidates) {
      const sourceId = `post_call:${sessionId}:${mc.content.slice(0, 30)}`;
      if (existingSourceIds.has(sourceId)) continue;

      const memory: Memory = {
        id: store.genId("mem"),
        familyId: session.familyId,
        elderId,
        caregiverId,
        memoryType: mc.type as Memory["memoryType"],
        content: mc.content,
        confidence: mc.confidence,
        importance: mc.importance as Memory["importance"],
        requiresReview: mc.requires_review,
        reviewed: false,
        sourceType: "post_call",
        sourceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.addMemory(memory);
    }

    // 4. 保存 CareInsight（每个 call_session 只有一条）
    let careInsightId: string | undefined;
    if (memoryResult.care_insight) {
      const ci = saveCareInsight({
        elderId,
        caregiverId,
        callSessionId: sessionId,
        insight: {
          factualSummary: memoryResult.care_insight.factual_summary,
          relationshipInsight: memoryResult.care_insight.relationship_insight,
          suggestedAction: memoryResult.care_insight.suggested_action,
          suggestedMessage: memoryResult.care_insight.suggested_message,
          confidence: memoryResult.care_insight.confidence,
        },
      });
      careInsightId = ci.id;
    }

    // 5. emit events
    for (const he of memoryResult.hook_events) {
      const event = eventBus.createEvent({
        type: he.event_type,
        idempotencyKey: `post_call:${sessionId}:${he.event_type}`,
        payload: { sessionId, ...he.payload },
      });
      await eventBus.emit(event);
    }

    // 6. 更新 session summary
    store.updateCallSession(sessionId, {
      summary: memoryResult.care_insight?.factual_summary ?? extraction.task_result.status,
    });

    // 标记完成
    callSessionService.setPostCallStatus(sessionId, "completed", careInsightId);

    return {
      kind: "post_call",
      content: "通话分析完成",
      data: {
        task_result: extraction.task_result,
        risk_signals: extraction.risk_signals,
        relay_message: extraction.relay_message,
        care_insight: memoryResult.care_insight,
        memory_count: memoryResult.memory_candidates.length,
      },
      safetyPolicy: preCheck.safetyPolicy,
    };
  } catch (error) {
    callSessionService.setPostCallStatus(sessionId, "failed");
    throw error;
  }
}
