// =====================================================================
// v2 CallSession Service — 管理 CallSession 状态、transcript、state_patch 合并
// 不负责 LLM 调用
// =====================================================================
import { store } from "../store/memory-store";
import type {
  CallSession,
  CallSessionStatus,
  TranscriptEntry,
  ConversationState,
  PostCallStatus,
} from "../store/types";

/**
 * 初始化 CallSession
 */
export function init(params: {
  taskOccurrenceId: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  phone: string;
  provider: string;
  callPlan?: CallSession["callPlan"];
}): CallSession {
  const session: CallSession = {
    id: store.genId("cs"),
    taskOccurrenceId: params.taskOccurrenceId,
    familyId: params.familyId,
    elderId: params.elderId,
    caregiverId: params.caregiverId,
    phone: params.phone,
    provider: params.provider,
    status: "dialing",
    attemptNo: 1,
    callPlan: params.callPlan,
    conversationState: {
      stage: "identity_and_consent",
      turnCount: 0,
      taskSlots: {},
      relationshipSlots: {},
      riskSignals: [],
      completedStages: [],
      probeBudget: {
        total: 5,
        health: 3,
        relationship: 2,
        totalRemaining: 5,
        healthRemaining: 3,
        relationshipRemaining: 2,
      },
      elderWillingness: "unknown",
      shouldCloseSoon: false,
      elapsedSeconds: 0,
    },
    transcript: [],
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return store.addCallSession(session);
}

/**
 * 加载 CallSession
 */
export function load(sessionId: string): CallSession | undefined {
  return store.getCallSession(sessionId);
}

/**
 * 追加 transcript 条目
 */
export function appendTranscript(
  sessionId: string,
  entry: TranscriptEntry
): void {
  const session = store.getCallSession(sessionId);
  if (!session) return;
  session.transcript.push(entry);
  session.updatedAt = new Date().toISOString();
}

/**
 * 合并 state_patch 到 conversationState
 */
export function applyStatePatch(
  sessionId: string,
  patch: Partial<ConversationState>
): void {
  const session = store.getCallSession(sessionId);
  if (!session) return;

  const cs = session.conversationState;

  if (patch.taskSlots) {
    cs.taskSlots = { ...cs.taskSlots, ...patch.taskSlots };
  }
  if (patch.relationshipSlots) {
    cs.relationshipSlots = { ...cs.relationshipSlots, ...patch.relationshipSlots };
  }
  if (patch.probeBudget) {
    cs.probeBudget = { ...cs.probeBudget, ...patch.probeBudget };
  }
  if (patch.elderWillingness !== undefined) {
    cs.elderWillingness = patch.elderWillingness;
  }
  if (patch.shouldCloseSoon !== undefined) {
    cs.shouldCloseSoon = patch.shouldCloseSoon;
  }
  if (patch.stage !== undefined) {
    if (!cs.completedStages.includes(cs.stage)) {
      cs.completedStages.push(cs.stage);
    }
    cs.stage = patch.stage;
  }
  if (patch.turnCount !== undefined) {
    cs.turnCount = patch.turnCount;
  }

  session.updatedAt = new Date().toISOString();
}

/**
 * 更新通话状态
 */
export function updateStatus(
  sessionId: string,
  status: CallSessionStatus
): void {
  store.updateCallSession(sessionId, { status });
}

/**
 * 获取完整 transcript 字符串（供 post-call 使用）
 */
export function getFullTranscript(sessionId: string): string {
  const session = store.getCallSession(sessionId);
  if (!session) return "";

  return session.transcript
    .map((e) => {
      const speaker = e.speaker === "assistant" ? "念念" : "长辈";
      return `${speaker}：${e.text}`;
    })
    .join("\n");
}

/**
 * 获取 v2 扩展字段（postCallStatus 等）
 */
export function getPostCallStatus(
  sessionId: string
): PostCallStatus | undefined {
  const session = store.getCallSession(sessionId) as CallSession & {
    postCallStatus?: PostCallStatus;
  };
  return session?.postCallStatus;
}

/**
 * 设置 v2 扩展字段
 */
export function setPostCallStatus(
  sessionId: string,
  status: PostCallStatus,
  careInsightId?: string
): void {
  const session = store.getCallSession(sessionId);
  if (!session) return;

  const ext = session as CallSession & {
    postCallStatus?: PostCallStatus;
    postCallProcessedAt?: string;
    careInsightId?: string;
  };

  ext.postCallStatus = status;
  if (status === "completed") {
    ext.postCallProcessedAt = new Date().toISOString();
  }
  if (careInsightId) {
    ext.careInsightId = careInsightId;
  }
}
