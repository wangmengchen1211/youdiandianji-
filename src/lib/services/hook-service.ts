import { store } from "../store/memory-store";
import type {
  HookEvent,
  HookCandidate,
  HookScore,
  ProactiveMessage,
} from "../store/types";

// =====================================================================
// Hook Service - manages proactive care message lifecycle
// =====================================================================

const MAX_PUSH_PER_DAY = 2;
const MAX_SENSITIVE_PER_DAY = 1;
const QUIET_START_HOUR = 22; // 22:00
const QUIET_END_HOUR = 8;   // 08:00
const CASE_COOLDOWN_HOURS = 12;

/**
 * Process a hook event: check idempotency, create candidate, score, and potentially enqueue message.
 */
export async function processHookEvent(event: HookEvent): Promise<void> {
  // Generate idempotency key
  const dateStr = new Date(event.createdAt).toISOString().split("T")[0];
  const idempotencyKey = `hook:${event.sourceId}:${event.eventType}:${dateStr}`;

  // Check if already exists
  if (existsHookCandidateByIdempotencyKey(idempotencyKey)) {
    return; // Idempotent: skip duplicate
  }

  // Create hook event record
  if (typeof (store as any).addHookEvent === "function") {
    (store as any).addHookEvent(event);
  }

  // Create candidate
  const candidate = await createHookCandidate(event, idempotencyKey);
  if (!candidate) return;

  // Score
  const score = scoreHookCandidate(candidate);
  candidate.score = score;

  // Store candidate
  if (typeof (store as any).addHookCandidate === "function") {
    (store as any).addHookCandidate(candidate);
  }

  // Decide action based on score
  if (score.finalScore >= 0.75) {
    // Can push directly
    const message = await realizeHookMessage(candidate);
    if (typeof (store as any).addProactiveMessage === "function") {
      (store as any).addProactiveMessage(message);
    }
  } else if (score.finalScore >= 0.55) {
    // App-only notification
    const message = await realizeHookMessage(candidate, "in_app");
    if (typeof (store as any).addProactiveMessage === "function") {
      (store as any).addProactiveMessage(message);
    }
  }
  // else: score < 0.55 → drop (don't disturb)
}

/**
 * Create a hook candidate from an event.
 */
export async function createHookCandidate(
  event: HookEvent,
  idempotencyKey?: string
): Promise<HookCandidate | null> {
  const dateStr = new Date(event.createdAt).toISOString().split("T")[0];
  const key = idempotencyKey ?? `hook:${event.sourceId}:${event.eventType}:${dateStr}`;

  // Check case cooldown
  if (event.payload.caseId && typeof event.payload.caseId === "string") {
    if (isWithinCooldown(event.payload.caseId as string, CASE_COOLDOWN_HOURS)) {
      return null;
    }
  }

  // Check quiet hours
  const hour = new Date().getHours();
  const isQuietTime = hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;

  return {
    id: store.genId("hook_cand"),
    idempotencyKey: key,
    familyId: event.familyId,
    caregiverId: (event.payload.caregiverId as string) ?? "",
    elderId: (event.payload.elderId as string) ?? "",
    caseId: (event.payload.caseId as string) ?? undefined,
    hookType: event.eventType,
    triggerReason: buildTriggerReason(event),
    messageGoal: buildMessageGoal(event),
    score: {
      importance: 0.5,
      timeliness: 0.5,
      relationshipValue: 0.5,
      riskLevel: 0.3,
      userBurden: isQuietTime ? 0.8 : 0.2,
      repetitionPenalty: 0.1,
      intrusionRisk: isQuietTime ? 0.7 : 0.2,
      finalScore: 0.5,
    },
    status: "pending",
    scheduledAt: isQuietTime
      ? getNextMorning().toISOString()
      : new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Score a hook candidate using pure rules (no LLM).
 */
export function scoreHookCandidate(candidate: HookCandidate): HookScore {
  const score: HookScore = {
    importance: getEventImportance(candidate.hookType),
    timeliness: getTimeliness(candidate),
    relationshipValue: getRelationshipValue(candidate.hookType),
    riskLevel: getRiskScore(candidate.hookType),
    userBurden: getUserBurden(candidate),
    repetitionPenalty: getRepetitionPenalty(candidate),
    intrusionRisk: getIntrusionRisk(candidate),
    finalScore: 0,
  };

  // Weighted final score
  score.finalScore = Math.round((
    score.importance * 0.25 +
    score.timeliness * 0.2 +
    score.relationshipValue * 0.2 +
    score.riskLevel * 0.15 +
    (1 - score.userBurden) * 0.1 +
    (1 - score.repetitionPenalty) * 0.05 +
    (1 - score.intrusionRisk) * 0.05
  ) * 100) / 100;

  return score;
}

/**
 * Generate a proactive message from a hook candidate.
 */
export async function realizeHookMessage(
  candidate: HookCandidate,
  channel: "in_app" | "push" = "push"
): Promise<ProactiveMessage> {
  // Try to use HookMessageRealizer agent for natural text
  let content = buildDefaultMessage(candidate);
  try {
    const { realizeHookMessageText } = await import("../agents/hook-message-realizer");
    content = await realizeHookMessageText(candidate);
  } catch {
    // Fallback to default
  }

  return {
    id: store.genId("proactive"),
    familyId: candidate.familyId,
    caregiverId: candidate.caregiverId,
    elderId: candidate.elderId,
    caseId: candidate.caseId,
    hookCandidateId: candidate.id,
    channel,
    content,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get due proactive messages that are ready to send.
 */
export function getDueProactiveMessages(now: Date): ProactiveMessage[] {
  if (typeof (store as any).getDueProactiveMessages === "function") {
    return (store as any).getDueProactiveMessages(now) as ProactiveMessage[];
  }
  return [];
}

export function markMessageSent(id: string): void {
  updateMessageStatus(id, "sent", { sentAt: new Date().toISOString() });
}

export function markMessageOpened(id: string): void {
  updateMessageStatus(id, "opened", { openedAt: new Date().toISOString() });
}

export function markMessageResponded(id: string): void {
  updateMessageStatus(id, "responded", { respondedAt: new Date().toISOString() });
}

export function dismissMessage(id: string): void {
  updateMessageStatus(id, "dismissed");
}

export function snoozeMessage(id: string, until: Date): void {
  updateMessageStatus(id, "snoozed", { snoozedUntil: until.toISOString() });
}

// =====================================================================
// Helper functions
// =====================================================================

function existsHookCandidateByIdempotencyKey(key: string): boolean {
  if (typeof (store as any).getHookCandidateByIdempotencyKey === "function") {
    return !!((store as any).getHookCandidateByIdempotencyKey(key));
  }
  return false;
}

function isWithinCooldown(caseId: string, hours: number): boolean {
  if (typeof (store as any).getRecentHookEvents === "function") {
    const events = (store as any).getRecentHookEvents(caseId) as HookEvent[];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return events.some((e) => new Date(e.createdAt).getTime() > cutoff);
  }
  return false;
}

function updateMessageStatus(
  id: string,
  status: string,
  extra?: Record<string, unknown>
): void {
  if (typeof (store as any).updateProactiveMessage === "function") {
    (store as any).updateProactiveMessage(id, { status, ...extra });
  }
}

function getNextMorning(): Date {
  const next = new Date();
  next.setHours(QUIET_END_HOUR, 0, 0, 0);
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function buildTriggerReason(event: HookEvent): string {
  switch (event.eventType) {
    case "task_completed": return "长辈的关怀任务已完成";
    case "task_failed": return "长辈的关怀任务未完成";
    case "elder_abnormal_response": return "长辈在通话中有异常回应";
    case "elder_relay_message": return "长辈有话想带给你";
    case "caregiver_inactive_6h": return "你已经6小时没有查看App了";
    case "caregiver_inactive_24h": return "你已经一天没有查看App了";
    case "care_case_opened": return "创建了新的关怀案例";
    case "care_case_unresolved_24h": return "关怀案例24小时未解决";
    case "festival_approaching": return "节日即将到来";
    case "birthday_approaching": return "生日即将到来";
    case "repeated_symptom_detected": return "检测到重复出现的症状";
    case "caregiver_burnout_signal": return "检测到照护疲劳信号";
    default: return "系统事件触发";
  }
}

function buildMessageGoal(event: HookEvent): string {
  switch (event.eventType) {
    case "task_completed": return "告知任务结果";
    case "elder_relay_message": return "转达长辈的话";
    case "elder_abnormal_response": return "提醒关注长辈健康";
    case "care_case_unresolved_24h": return "提醒跟进关怀案例";
    case "festival_approaching": return "提醒节日关怀";
    default: return "温馨提醒";
  }
}

function buildDefaultMessage(candidate: HookCandidate): string {
  return `${candidate.triggerReason}。${candidate.messageGoal}。`;
}

function getEventImportance(hookType: string): number {
  const importanceMap: Record<string, number> = {
    elder_abnormal_response: 0.9,
    repeated_symptom_detected: 0.85,
    safety_risk: 0.95,
    caregiver_burnout_signal: 0.7,
    elder_relay_message: 0.6,
    task_completed: 0.4,
    task_failed: 0.6,
    care_case_unresolved_24h: 0.7,
    festival_approaching: 0.5,
    birthday_approaching: 0.6,
    caregiver_inactive_6h: 0.3,
    caregiver_inactive_24h: 0.5,
  };
  return importanceMap[hookType] ?? 0.5;
}

function getTimeliness(candidate: HookCandidate): number {
  const scheduled = new Date(candidate.scheduledAt);
  const now = new Date();
  const diffMinutes = (scheduled.getTime() - now.getTime()) / 60000;
  if (diffMinutes < 0) return 0.9; // overdue
  if (diffMinutes < 30) return 0.8;
  if (diffMinutes < 120) return 0.6;
  return 0.4;
}

function getRelationshipValue(hookType: string): number {
  const valueMap: Record<string, number> = {
    elder_relay_message: 0.9,
    festival_approaching: 0.7,
    birthday_approaching: 0.7,
    task_completed: 0.5,
    care_case_unresolved_24h: 0.6,
    elder_abnormal_response: 0.7,
  };
  return valueMap[hookType] ?? 0.5;
}

function getRiskScore(hookType: string): number {
  const riskMap: Record<string, number> = {
    elder_abnormal_response: 0.8,
    repeated_symptom_detected: 0.8,
    safety_risk: 0.95,
    caregiver_burnout_signal: 0.6,
    task_failed: 0.4,
  };
  return riskMap[hookType] ?? 0.3;
}

function getUserBurden(candidate: HookCandidate): number {
  const hour = new Date().getHours();
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return 0.8;
  return 0.2;
}

function getRepetitionPenalty(candidate: HookCandidate): number {
  return 0.1; // Default low; could check recent message count
}

function getIntrusionRisk(candidate: HookCandidate): number {
  const sensitiveTypes = ["caregiver_burnout_signal", "repeated_symptom_detected", "elder_abnormal_response"];
  if (sensitiveTypes.includes(candidate.hookType)) return 0.6;
  const hour = new Date().getHours();
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return 0.7;
  return 0.2;
}
