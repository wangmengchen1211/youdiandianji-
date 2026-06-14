import type { CallStage, ConversationState, ProbeBudget } from "../store/types";

/**
 * Ordered call stages. The state machine controls transitions deterministically.
 * LLM only generates dialogue - it does NOT decide which stage comes next.
 */
export const CALL_STAGES: CallStage[] = [
  "identity_and_consent",
  "warm_greeting",
  "child_update",
  "open_care_question",
  "listen_and_reflect",
  "task_reminder",
  "confirm_task",
  "ask_relay_message",
  "closing",
  "post_call_analysis",
];

const STAGE_INDEX = new Map<CallStage, number>(
  CALL_STAGES.map((s, i) => [s, i])
);

/**
 * Determine the next stage based on current state.
 * Rules:
 * - Normally advance to the next stage in order.
 * - If task_reminder slot is collected (e.g., medication_taken is set), skip confirm_task -> ask_relay_message.
 * - listen_and_reflect is optional: only entered if elder expresses emotion/long story.
 * - confirm_task is skipped if all required slots already filled.
 */
export function nextStage(state: ConversationState): CallStage {
  const currentIndex = STAGE_INDEX.get(state.stage) ?? 0;

  // Already at the end
  if (state.stage === "post_call_analysis") return "post_call_analysis";
  if (state.stage === "closing") return "post_call_analysis";

  // Skip listen_and_reflect unless the elder is sharing something emotional
  if (state.stage === "open_care_question") {
    // If elder gave a brief factual answer, skip listen_and_reflect -> go to task_reminder
    return "task_reminder";
  }

  // After listen_and_reflect, always go to task_reminder
  if (state.stage === "listen_and_reflect") {
    return "task_reminder";
  }

  // Skip confirm_task if task slots already collected
  if (state.stage === "task_reminder") {
    const hasTaskResult = Object.keys(state.taskSlots).length > 0;
    if (hasTaskResult) return "ask_relay_message";
    return "confirm_task";
  }

  // Skip confirm_task if task already confirmed via slots
  if (state.stage === "confirm_task") {
    return "ask_relay_message";
  }

  // Default: advance to next in sequence
  return CALL_STAGES[currentIndex + 1] ?? "post_call_analysis";
}

/**
 * Should we enter listen_and_reflect stage?
 * Only if elder's reply suggests emotion, worry, or a longer story.
 */
export function shouldListenAndReflect(elderReply: string): boolean {
  const emotionalKeywords = [
    "想",
    "担心",
    "怕",
    "难过",
    "孤单",
    "不开心",
    "累",
    "没事",
    "不用管",
    "忙她的",
    "别操心",
    "不碍事",
  ];
  const replyLen = elderReply.length;
  const hasEmotion = emotionalKeywords.some((kw) => elderReply.includes(kw));
  return replyLen > 30 && hasEmotion;
}

/**
 * Get a human-readable label for each stage (useful for UI).
 */
export function stageLabel(stage: CallStage): string {
  const labels: Record<CallStage, string> = {
    identity_and_consent: "说明身份",
    warm_greeting: "温暖问候",
    child_update: "转达近况",
    open_care_question: "关心状态",
    listen_and_reflect: "倾听回应",
    task_reminder: "温柔提醒",
    confirm_task: "确认任务",
    ask_relay_message: "询问带话",
    closing: "温柔结束",
    post_call_analysis: "通话分析",
  };
  return labels[stage];
}

/**
 * Create an initial conversation state for a new call.
 */
export function createInitialState(): ConversationState {
  return {
    stage: "identity_and_consent",
    turnCount: 0,
    taskSlots: {},
    relationshipSlots: {},
    riskSignals: [],
    completedStages: [],
    probeBudget: {
      total: 3,
      health: 1,
      relationship: 2,
      totalRemaining: 3,
      healthRemaining: 1,
      relationshipRemaining: 2,
    },
    elderWillingness: "unknown",
    shouldCloseSoon: false,
    elapsedSeconds: 0,
  };
}

/**
 * Update probe budget with a partial patch.
 */
export function updateProbeBudget(
  state: ConversationState,
  patch: Partial<ProbeBudget>
): void {
  Object.assign(state.probeBudget, patch);
  // Ensure remaining doesn't exceed total
  state.probeBudget.totalRemaining = Math.min(
    state.probeBudget.totalRemaining,
    state.probeBudget.total
  );
  state.probeBudget.healthRemaining = Math.min(
    state.probeBudget.healthRemaining,
    state.probeBudget.health
  );
  state.probeBudget.relationshipRemaining = Math.min(
    state.probeBudget.relationshipRemaining,
    state.probeBudget.relationship
  );
}

/**
 * Should we end the call?
 * Based on elapsed time, turn count, elder willingness, and shouldCloseSoon flag.
 *
 * P1-5: 让位 LLM 决策。
 * - 硬限制（refused / 超时 / 超轮次）仍然强制结束
 * - shouldCloseSoon（如 probe_budget 用尽）只是软信号，会透传给 LLM
 *   让它自己决定是否要推进到 closing，状态机不再强制覆盖
 */
export function shouldEndCall(state: ConversationState): boolean {
  // Elder explicitly refused
  if (state.elderWillingness === "refused") return true;

  // Max duration exceeded (default 4 minutes = 240s)
  if (state.elapsedSeconds > 240) return true;

  // Too many turns without progress
  if (state.turnCount > 12) return true;

  // 注：state.shouldCloseSoon 不再作为硬结束条件，
  // 而是透传给 LLM 供参考（如 turn-planner 收到 closeHint=true 会主动收尾）

  return false;
}

/**
 * 是否"建议 LLM 主动收尾"的软信号
 * 用于将 shouldCloseSoon 等状态以 hint 形式喂给 LLM
 */
export function shouldSuggestClose(state: ConversationState): boolean {
  return state.shouldCloseSoon && state.turnCount >= 6;
}

/**
 * Should we enter listen_and_reflect stage?
 * Enhanced version of shouldListenAndReflect with more signals.
 */
export function shouldEnterListenAndReflect(elderReply: string): boolean {
  const emotionalKeywords = [
    "想", "担心", "怕", "难过", "孤单", "不开心",
    "累", "没事", "不用管", "忙她的", "别操心", "不碍事",
    "算了", "不想说", "没什么", "你们忙",
  ];
  const replyLen = elderReply.length;
  const hasEmotion = emotionalKeywords.some((kw) => elderReply.includes(kw));

  // Longer replies with emotional content → listen and reflect
  if (replyLen > 30 && hasEmotion) return true;

  // Very long reply (>80 chars) likely means elder is sharing something important
  if (replyLen > 80) return true;

  return false;
}
