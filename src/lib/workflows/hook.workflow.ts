// =====================================================================
// v2 Hook Workflow — 编排器
// HookService 只做纯领域能力（去重/冷却/评分/限流/入队）
// HookMessagePlanner 不决定 should_send
// =====================================================================
import * as safetyService from "../services/safety.service";
import * as contextService from "../services/context.service";
import * as eventBus from "../services/event-bus.service";
import { planHookMessage } from "../cognitive/hook-message-planner";
import { store } from "../store/memory-store";
import type { HookEvent, HookCandidate, HookScore, DomainEvent } from "../store/types";
import type { WorkflowResult } from "../store/types";

const MAX_PUSH_PER_DAY = 2;
const MAX_SENSITIVE_PER_DAY = 1;
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;
const CASE_COOLDOWN_HOURS = 12;

export type HookWorkflowParams = {
  event: DomainEvent;
  elderId: string;
  caregiverId: string;
  familyId: string;
};

/**
 * Hook 编排器：DomainEvent → 去重 → 评分 → 文案 → 安全检查 → 入队
 */
export async function handle(params: HookWorkflowParams): Promise<WorkflowResult> {
  const { event, elderId, caregiverId, familyId } = params;

  // 1. 去重（idempotencyKey）
  if (eventBus.isDuplicate(event.idempotencyKey)) {
    return {
      kind: "hook_message",
      content: "重复事件，已跳过",
      data: { action: "deduped" },
    };
  }

  // 2. 冷却检查
  const dateStr = new Date(event.createdAt).toISOString().split("T")[0];
  const idempotencyKey = `hook:${event.payload.sourceId ?? ""}:${event.type}:${dateStr}`;
  const existingCandidate = store.getHookCandidateByIdempotencyKey(idempotencyKey);
  if (existingCandidate) {
    return {
      kind: "hook_message",
      content: "冷却期内，已跳过",
      data: { action: "cooldown" },
    };
  }

  // 3. 每日限额检查
  const todayMessages = store.proactiveMessages.filter(
    (m) => m.status !== "dismissed" && new Date(m.createdAt).toISOString().startsWith(dateStr)
  );
  if (todayMessages.length >= MAX_PUSH_PER_DAY) {
    return {
      kind: "hook_message",
      content: "今日推送已达上限",
      data: { action: "daily_limit" },
    };
  }

  // 4. 静默时间检查
  const now = new Date();
  const hour = now.getHours();
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) {
    return {
      kind: "hook_message",
      content: "静默时间，已跳过",
      data: { action: "quiet_hours" },
    };
  }

  // 5. 评分（7 维加权）
  const score: HookScore = scoreEvent(event, todayMessages.length);
  if (score.finalScore < 0.55) {
    return {
      kind: "hook_message",
      content: "评分过低，不打扰",
      data: { action: "dropped", score },
    };
  }

  // 6. LLM 生成候选文案（HookMessagePlanner 不决定 should_send）
  const ctx = contextService.forHook(elderId, caregiverId);
  const preCheck = safetyService.preCheck("");
  const constraints = safetyService.policyConstraint(preCheck.safetyPolicy);

  const messageResult = await planHookMessage({
    hookEvent: event as any,
    score: score as any,
    familyContext: ctx.serialized,
    safetyPolicy: preCheck.safetyPolicy,
    policyConstraints: constraints,
  });

  // 7. SafetyService.postCheck
  const safetyCheck = safetyService.postCheck(messageResult.message);
  const finalMessage =
    safetyCheck.action === "block"
      ? safetyCheck.sanitizedText
      : safetyCheck.action === "sanitize"
        ? safetyCheck.sanitizedText
        : messageResult.message;

  // 8. 入队
  const channel = score.finalScore >= 0.75 ? "push" : "in_app";
  const proactiveMessage = {
    id: store.genId("pm"),
    familyId,
    caregiverId,
    elderId,
    hookCandidateId: idempotencyKey,
    channel: channel as "push" | "in_app",
    content: finalMessage,
    status: "queued" as const,
    createdAt: new Date().toISOString(),
  };
  store.addProactiveMessage(proactiveMessage);

  return {
    kind: "hook_message",
    content: finalMessage,
    data: {
      action: "enqueued",
      score,
      delivery_hint: messageResult.delivery_hint,
      trigger_event: messageResult.trigger_event,
      why_now: messageResult.why_now,
      message_goal: messageResult.message_goal,
    },
    safetyPolicy: preCheck.safetyPolicy,
  };
}

// --- 7 维评分（从现有 hook-service 提取）---
function scoreEvent(event: DomainEvent, todayCount: number): HookScore {
  const importance = 0.6;
  const timeliness = event.type.includes("task_completed") ? 0.8 : 0.5;
  const relationshipValue = event.type.includes("relay") ? 0.9 : 0.5;
  const riskLevel = event.type.includes("risk") || event.type.includes("abnormal") ? 0.8 : 0.3;
  const userBurden = todayCount >= MAX_PUSH_PER_DAY ? 0.9 : todayCount * 0.2;
  const repetitionPenalty = 0.1;
  const intrusionRisk = 0.2;

  const finalScore = Math.max(
    0,
    Math.min(
      1,
      importance * 0.2 +
        timeliness * 0.15 +
        relationshipValue * 0.2 +
        riskLevel * 0.15 +
        (1 - userBurden) * 0.15 +
        (1 - repetitionPenalty) * 0.08 +
        (1 - intrusionRisk) * 0.07
    )
  );

  return {
    importance,
    timeliness,
    relationshipValue,
    riskLevel,
    userBurden,
    repetitionPenalty,
    intrusionRisk,
    finalScore,
  };
}
