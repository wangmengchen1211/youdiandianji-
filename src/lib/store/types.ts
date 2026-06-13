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
