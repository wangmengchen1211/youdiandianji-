// =====================================================================
// 核心领域类型定义
// =====================================================================

export type Elder = {
  id: string;
  familyId: string;
  displayName: string;
  realName?: string;
  relation: string;
  relationLabel: string;
  nicknames: string[];
  phone: string;
  deviceType?: "mobile_app" | "feature_phone" | "watch";
  timezone: string;
  availableTime: { start: string; end: string };
  preferredChannels: ("phone" | "app_message")[];
  communicationPreference: string[];
  healthFocus: string[];
  responseHabit?: string;
  createdAt: string;
  updatedAt: string;
};

export type Caregiver = {
  id: string;
  familyId: string;
  displayName: string;
  phone?: string;
  role: string;
  writingStyle?: string;
  createdAt: string;
  updatedAt: string;
};

export type CaregiverUpdate = {
  id: string;
  caregiverId: string;
  content: string;
  canShareWithElder: boolean;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
};

export type RelationshipProfile = {
  id: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  toneProfile?: string[];
  sharedMemories?: string[];
  sensitiveTopics?: string[];
  preferredContactStyle?: string;
  createdAt: string;
  updatedAt: string;
};

// =====================================================================
// 任务相关
// =====================================================================

export type TaskType = "daily_care_call";

export type RecurrenceRule = {
  type: "daily" | "weekly" | "once";
  time: string; // "HH:mm"
  timezone: string;
  daysOfWeek?: number[]; // 0=Sun..6=Sat for weekly
};

export type PrimaryObjective = {
  type: "reminder" | "health_check" | "bring_items" | "call_back" | "other";
  content: string;
};

export type RelationshipObjective = {
  type:
    | "deliver_child_update"
    | "ask_elder_message"
    | "express_care"
    | "apology"
    | "other";
  content: string;
};

export type RetryPolicy = {
  maxAttempts: number;
  retryAfterMinutes: number;
};

export type CallPolicy = {
  maxDurationSeconds: number;
  maxExtraQuestions: number;
  tone: string;
};

export type TaskTemplate = {
  id: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  title: string;
  taskType: TaskType;
  recurrenceRule: RecurrenceRule;
  primaryObjectives: PrimaryObjective[];
  relationshipObjectives: RelationshipObjective[];
  requiredSlots: string[];
  retryPolicy: RetryPolicy;
  callPolicy: CallPolicy;
  status: "active" | "paused" | "cancelled";
  nextRunAt: string; // ISO timestamp
  createdAt: string;
  updatedAt: string;
};

export type OccurrenceStatus =
  | "scheduled"
  | "calling"
  | "answered"
  | "completed"
  | "partially_completed"
  | "no_answer"
  | "failed"
  | "cancelled"
  | "needs_review";

export type TaskOccurrence = {
  id: string;
  taskTemplateId: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  scheduledAt: string;
  status: OccurrenceStatus;
  result?: TaskResult;
  callSessionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskResult = {
  status: "completed" | "partially_completed" | "no_answer" | "failed";
  slots: Record<string, unknown>;
  riskSignals?: RiskSignal[];
  messageToChild?: string;
  confidence: number;
  needsReview: boolean;
};

export type RiskSignal = {
  type: "symptom" | "emotional" | "safety";
  content: string;
  severity: "low" | "medium" | "high" | "unknown";
  shouldNotifyCaregiver: boolean;
};

// =====================================================================
// 通话相关
// =====================================================================

export type CallStage =
  | "identity_and_consent"
  | "warm_greeting"
  | "child_update"
  | "open_care_question"
  | "listen_and_reflect"
  | "task_reminder"
  | "confirm_task"
  | "ask_relay_message"
  | "closing"
  | "post_call_analysis";

export type CallSessionStatus =
  | "dialing"
  | "connected"
  | "in_progress"
  | "ended"
  | "no_answer"
  | "failed";

export type TranscriptEntry = {
  speaker: "assistant" | "elder";
  text: string;
  stage: CallStage;
  timestamp: string;
};

export type CallPlanStage = {
  stage: CallStage;
  goal: string;
  sampleScript: string;
};

export type CallPlan = {
  callPlanId: string;
  maxDurationSeconds: number;
  maxExtraQuestions: number;
  stages: CallPlanStage[];
};

export type ConversationState = {
  stage: CallStage;
  turnCount: number;
  taskSlots: Record<string, unknown>;
  relationshipSlots: Record<string, unknown>;
  riskSignals: RiskSignal[];
  completedStages: CallStage[];
  // New fields for proactive conversation
  probeBudget: ProbeBudget;
  elderWillingness: "unknown" | "willing" | "low" | "refused";
  shouldCloseSoon: boolean;
  elapsedSeconds: number;
  lastElderUtterance?: string;
  lastAssistantUtterance?: string;
};

export type CallSession = {
  id: string;
  taskOccurrenceId: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  phone: string;
  provider: string;
  providerCallId?: string;
  status: CallSessionStatus;
  attemptNo: number;
  callPlan?: CallPlan;
  conversationState: ConversationState;
  transcript: TranscriptEntry[];
  summary?: string;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
};

// =====================================================================
// 记忆与洞察
// =====================================================================

export type MemoryType =
  | "health_memory"
  | "routine_memory"
  | "preference_memory"
  | "relationship_memory"
  | "relay_memory"
  | "emotional_signal";

export type Memory = {
  id: string;
  familyId: string;
  elderId?: string;
  caregiverId?: string;
  relationshipProfileId?: string;
  memoryType: MemoryType;
  content: string;
  structuredValue?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  confidence: number;
  importance: "low" | "medium" | "high";
  requiresReview: boolean;
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CareInsight = {
  id: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  callSessionId?: string;
  taskOccurrenceId?: string;
  factualSummary: string;
  relationshipInsight: string;
  suggestedAction: string;
  suggestedMessage: string;
  confidence: number;
  createdAt: string;
};

export type RelayMessage = {
  id: string;
  familyId: string;
  fromType: "caregiver" | "elder";
  fromId: string;
  toType: "caregiver" | "elder";
  toId: string;
  content: string;
  originalContent?: string;
  toneRewrittenContent?: string;
  status: "pending" | "delivered" | "acknowledged" | "cancelled";
  sourceCallSessionId?: string;
  deliveredAt?: string;
  createdAt: string;
};

// =====================================================================
// Agent 输入/输出类型
// =====================================================================

export type TaskDesignInput = {
  userId: string;
  text: string;
  currentElderId: string | null;
  knownElders: { elderId: string; displayName: string; nicknames: string[] }[];
};

export type TaskDesignOutput = {
  intent: "create_daily_care_call";
  needFollowUp: boolean;
  followUpQuestion: string | null;
  missingFields: string[];
  taskBlueprint: TaskBlueprint | null;
};

export type TaskBlueprint = {
  elderId: string;
  elderDisplayName: string;
  title: string;
  taskType: TaskType;
  recurrenceRule: RecurrenceRule;
  primaryObjectives: PrimaryObjective[];
  relationshipObjectives: RelationshipObjective[];
  requiredSlots: string[];
  retryPolicy: RetryPolicy;
  callPolicy: CallPolicy;
};

export type RelationshipContext = {
  elderProfile: {
    elderId: string;
    displayName: string;
    relation: string;
    communicationStyle: string;
    preferences: string[];
    healthContext: string[];
  };
  caregiverProfile: {
    caregiverId: string;
    displayName: string;
    recentUpdates: { content: string; canShareWithElder: boolean }[];
  };
  relationshipMemory: string[];
  recentCallSummaries: string[];
  pendingRelayMessages: {
    from: "caregiver" | "elder";
    to: "caregiver" | "elder";
    content: string;
    status: string;
  }[];
  todayObjectives: string[];
};

export type ResponseUnderstandingOutput = {
  taskStatus: "completed" | "partially_completed" | "in_progress";
  slots: Record<string, unknown>;
  riskSignals: RiskSignal[];
  messageToChild: string | null;
  confidence: number;
  needsReview: boolean;
};

export type MemoryExtractionOutput = {
  newMemories: {
    type: MemoryType;
    content: string;
    importance: "low" | "medium" | "high";
    confidence: number;
    writeTo: string;
    requiresReview: boolean;
  }[];
};

export type CareInsightOutput = {
  factualSummary: string;
  relationshipInsight: string;
  suggestedAction: string;
  suggestedMessage: string;
  confidence: number;
};

// =====================================================================
// 深度对话 & 主动关怀 新增类型
// =====================================================================

// --- Probe Budget ---

export type ProbeBudget = {
  total: number;
  health: number;
  relationship: number;
  totalRemaining: number;
  healthRemaining: number;
  relationshipRemaining: number;
};

// --- 情境识别 ---

export type SituationType =
  | "possible_cognitive_decline"
  | "elder_health_change"
  | "elder_emotional_distress"
  | "caregiver_burnout"
  | "parent_child_conflict"
  | "guilt_and_distance"
  | "missed_medication"
  | "safety_risk"
  | "loneliness_signal"
  | "routine_care_task"
  | "relationship_repair"
  | "festival_or_anniversary_care"
  | "unknown";

export type RiskLevel = "low" | "medium" | "medium_high" | "high";

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  medium_high: 3,
  high: 4,
};

export function isRiskAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return riskRank[level] >= riskRank[threshold];
}

export type SituationAnalysis = {
  situationType: SituationType;
  secondaryTypes: SituationType[];
  riskLevel: RiskLevel;
  explicitNeed: string;
  implicitNeeds: string[];
  missingInfo: string[];
  recommendedStrategy:
    | "ask_targeted_questions"
    | "provide_safety_guidance"
    | "create_task"
    | "rewrite_message"
    | "offer_emotional_support"
    | "escalate_to_caregiver_action";
  forbiddenResponse: string[];
};

// --- 深度对话 ---

export type DepthPlan = {
  conversationStage: string;
  goal: string;
  askDimensions: string[];
  questions: string[];
  responseStyle: string;
  shouldCreateCase: boolean;
  caseType?: string;
};

// --- 关怀案例 (CareCase) ---

export type CareCaseRiskFlag = {
  type: string;
  content: string;
  level: string;
};

export type CareCase = {
  id: string;
  familyId: string;
  elderId: string;
  caregiverId: string;
  caseType: string;
  status: "open" | "resolved" | "escalated";
  summary: string;
  knownFacts: string[];
  unknowns: string[];
  riskFlags: CareCaseRiskFlag[];
  relationshipContext: Record<string, string>;
  nextSteps: string[];
  followUpAt?: string;
  createdAt: string;
  updatedAt: string;
};

// --- Agent 路由 ---

export type AgentRouteKind =
  | "createTask"
  | "rewriteNote"
  | "querySummary"
  | "addElder"
  | "deepCare"
  | "unknown";

export type AgentRouteResult = {
  kind: AgentRouteKind;
  confidence: number;
  reason: string;
  situationAnalysis?: SituationAnalysis;
};

// --- 统一家庭上下文 ---

export type FamilyContext = {
  familyId: string;
  caregiver: {
    caregiverId: string;
    displayName: string;
    recentUpdates: { content: string; canShareWithElder: boolean }[];
  };
  elder: {
    elderId: string;
    displayName: string;
    relation: string;
    communicationStyle: string;
    preferences: string[];
    healthContext: string[];
  };
  relationshipProfile?: {
    sharedMemories: string[];
    sensitiveTopics: string[];
    preferredContactStyle: string;
  };
  memories: { type: string; content: string; importance: string }[];
  openCareCases: CareCase[];
  recentCallSummaries: string[];
  recentCareInsights: { factualSummary: string; relationshipInsight: string }[];
  pendingRelayMessages: {
    from: string;
    to: string;
    content: string;
    status: string;
  }[];
  todayObjectives: string[];
  userStyle: {
    tone: string;
    avoid: string[];
    desired: string[];
  };
};

// --- 主动 Hook ---

export type HookEventType =
  | "task_completed"
  | "task_failed"
  | "elder_abnormal_response"
  | "elder_relay_message"
  | "caregiver_reopens_app"
  | "caregiver_inactive_6h"
  | "caregiver_inactive_24h"
  | "care_case_opened"
  | "care_case_unresolved_24h"
  | "festival_approaching"
  | "birthday_approaching"
  | "repeated_symptom_detected"
  | "caregiver_burnout_signal";

export type HookEvent = {
  id: string;
  familyId: string;
  eventType: HookEventType;
  sourceType: string;
  sourceId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type HookScore = {
  importance: number;
  timeliness: number;
  relationshipValue: number;
  riskLevel: number;
  userBurden: number;
  repetitionPenalty: number;
  intrusionRisk: number;
  finalScore: number;
};

export type HookCandidate = {
  id: string;
  idempotencyKey: string;
  familyId: string;
  caregiverId: string;
  elderId: string;
  caseId?: string;
  hookType: string;
  triggerReason: string;
  messageGoal: string;
  score: HookScore;
  status: "pending" | "sent" | "dismissed" | "snoozed" | "dropped";
  scheduledAt: string;
  createdAt: string;
};

export type ProactiveMessage = {
  id: string;
  familyId: string;
  caregiverId: string;
  elderId: string;
  caseId?: string;
  hookCandidateId: string;
  channel: "in_app" | "push";
  content: string;
  status: "queued" | "sent" | "opened" | "responded" | "dismissed" | "snoozed";
  sentAt?: string;
  openedAt?: string;
  respondedAt?: string;
  snoozedUntil?: string;
  createdAt: string;
};

// --- Case Formulation Builder 输出 ---

export type CaseFormulationUpdate = {
  newKnownFacts: string[];
  updatedUnknowns: string[];
  newRiskFlags: CareCaseRiskFlag[];
  updatedNextSteps: string[];
  followUpAt?: string;
  statusChange?: "open" | "resolved" | "escalated";
};

// --- Turn Planner 输出 ---

export type TurnPlanAnalysis = {
  factualInfo: Record<string, unknown>;
  taskSlots: Record<string, unknown>;
  relationshipSignals: { type: string; content: string; evidence: string; confidence: number }[];
  emotion: { label: string; evidence: string; confidence: number };
  probeOpportunities: { type: string; questionGoal: string; priority: string }[];
  stageCompleted: boolean;
  shouldEndCall: boolean;
};

export type TurnPlanNext = {
  action: string;
  stage: string;
  reason: string;
  assistantText: string;
  isCallEnding: boolean;
};

export type TurnPlanOutput = {
  analysis: TurnPlanAnalysis;
  next: TurnPlanNext;
  statePatch: {
    taskSlots?: Record<string, unknown>;
    relationshipSlots?: Record<string, unknown>;
    probeBudget?: Partial<ProbeBudget>;
    elderWillingness?: "unknown" | "willing" | "low" | "refused";
    shouldCloseSoon?: boolean;
  };
  memoryCandidates: {
    type: string;
    content: string;
    confidence: number;
    requiresReview: boolean;
  }[];
};

// =====================================================================
// v2 架构新增类型
// =====================================================================

// --- Safety Policy（7 种安全策略枚举）---

export type SafetyPolicy =
  | "general_safe"
  | "medical_no_diagnosis"
  | "medical_no_dosage"
  | "cognitive_careful"
  | "no_impersonation"
  | "no_blame_no_guilt"
  | "no_sensitive_extraction";

// --- Domain Event（带 idempotencyKey）---

export type DomainEvent = {
  id: string;
  type: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

// --- Observation（通话轮次观察，5 种类型）---

export type ObservationType =
  | "health_fact"
  | "routine_fact"
  | "emotional_signal"
  | "relationship_signal"
  | "task_slot";

export type Observation = {
  type: ObservationType;
  content: string;
  confidence: number;
  source: string; // e.g. "elder_said", "inferred"
};

// --- Workflow Result ---

export type WorkflowResultKind =
  | "text"
  | "task_draft"
  | "deep_care"
  | "call_turn"
  | "post_call"
  | "hook_message"
  | "error";

export type WorkflowResult = {
  kind: WorkflowResultKind;
  content: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  safetyPolicy?: SafetyPolicy[];
  situationAnalysis?: SituationAnalysis;
  observations?: Observation[];
  hookEvents?: { eventType: HookEventType; payload: Record<string, unknown> }[];
};

// --- Post-call 幂等状态 ---

export type PostCallStatus = "pending" | "processing" | "completed" | "failed";

// --- CallSession v2 扩展字段 ---
// 通过 partial merge 使用，CallSession 本体不修改
export type CallSessionV2Fields = {
  postCallStatus?: PostCallStatus;
  postCallProcessedAt?: string;
  careInsightId?: string;
};
