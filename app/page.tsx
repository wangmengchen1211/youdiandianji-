"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpeechSynthesis } from "./components/hooks/useSpeechSynthesis";
import {
  MAIN_TAB_BY_CATEGORY,
  MAIN_TAB_LABEL,
  SUB_CAT_LABEL,
  type Candidate as ImportCandidate,
  type MemoryCategoryValue,
} from "@/src/lib/import-parsers/schemas/extract-result.schema";

type TabKey = "home" | "tasks" | "notifications" | "profile" | "assistant";
type MessageKind = "text" | "taskDraft" | "note" | "summary";
type UserMode = "child" | "elder";
type TaskType =
  | "medication"
  | "health_measurement"
  | "bring_items"
  | "call_back"
  | "other";
type TaskStatus =
  | "created"
  | "scheduled"
  | "sent"
  | "reached"
  | "confirmed"
  | "completed"
  | "unconfirmed"
  | "timeout"
  | "cancelled"
  | "need_review"
  | "not_done"
  | "postponed";
type NotificationLevel = "success" | "warning" | "danger" | "info" | "review";

type Elder = {
  id: string;
  relation: string;
  displayName: string;
  phone: string;
  availableTime: string;
  focus: string[];
  communicationPreference: string[];
  responseHabit: string;
  nicknames: string[];
  recentResponseAt?: string;
  oneLinePortrait?: string;
  healthFocus?: string[];
  recentSignals?: string[];
  personalityTraits?: string[];
  relationshipMemories?: string[];
};

type MemoryCategory =
  | "about_user" | "about_elder" | "relationship" | "communication_style" | "pending_review"
  | "elder_basic" | "elder_health" | "elder_habits" | "elder_contact"
  | "rel_emotional" | "rel_history" | "rel_events" | "rel_preferences"
  | "chat_language" | "chat_expression" | "chat_focus" | "chat_taboo";

type MemoryEntry = {
  id: string;
  category: MemoryCategory;
  content: string;
  source?: string;
  importance?: "high" | "medium" | "low";
  elderId?: string;
  createdAt: string;
};

type TaskLog = {
  id: string;
  time: string;
  event: string;
};

type Task = {
  id: string;
  title: string;
  type: TaskType;
  elderId: string;
  elderDisplayName: string;
  content: string;
  remindLabel: string;
  repeatRule: string;
  channel: string;
  needConfirmation: boolean;
  needResult: boolean;
  status: TaskStatus;
  result?: string;
  relayMessage?: string;
  createdAt: string;
  updatedAt: string;
  logs: TaskLog[];
};

type TaskDraft = {
  id: string;
  title: string;
  type: TaskType;
  elderId: string;
  elderDisplayName: string;
  content: string;
  remindLabel: string;
  repeatRule: string;
  channel: string;
  needConfirmation: boolean;
  needResult: boolean;
  priority: string;
  created: boolean;
  relayMessage?: string;
};

type TaskCreateStep = "idle" | "awaiting_time" | "awaiting_relay";

type TaskCreateFlow = {
  step: TaskCreateStep;
  rawText: string;
  targets: Elder[];
  taskType: TaskType;
  remindLabel: string;
  repeatRule: string;
  relayMessage: string;
  recommendedSlots: string[];
};

type NoteVersion = {
  style: string;
  text: string;
};

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  level: NotificationLevel;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: MessageKind;
  createdAt?: string;
  dayKey?: string;
  drafts?: TaskDraft[];
  noteVersions?: NoteVersion[];
};

type AssistantMemory = {
  dayKey: string;
  dateLabel: string;
  summary: string;
  childTranscript: string[];
  elderTranscript: string[];
  updatedAt: string;
};

type AgentServerResponse = {
  kind: MessageKind;
  content: string;
  drafts?: Array<Omit<TaskDraft, "id" | "created">>;
  noteVersions?: NoteVersion[];
  openProfile?: boolean;
  relationHint?: string;
};

type ElderFormState = {
  relation: string;
  displayName: string;
  phone: string;
  availableTime: string;
  focus: string[];
  communicationPreference: string[];
  responseHabit: string;
};

type AssistantProfile = {
  tone: string;
  rhythm: string;
  initiative: string;
  signature: string;
};

type CallSession = {
  open: boolean;
  audience: UserMode;
  taskId: string | null;
  elderId: string | null;      // 新增：锁定这通电话的长辈身份
  sessionId: string | null;    // 新增：服务端会话 ID
  phase: "dialing" | "connected" | "speaking" | "listening" | "ended" | "missed" | "loading";
  // 动态对话状态（LLM 驱动）
  callHistory: Array<{ role: "assistant" | "elder"; text: string }>;
  currentSpeakText?: string;
  currentStage?: string;   // greeting | warm_chat | task_reminder | relay | closing
  elderResponses?: string[];
};

type CallTurn = {
  text: string;
  id: string;
  waitResponse: boolean;
  topic?: string;
};

type CallInsight = {
  id: string;
  taskId: string;
  elderId: string;
  elderDisplayName: string;
  factualSummary: string;
  relationshipInsight: string;
  suggestedAction: string;
  suggestedMessage: string;
  createdAt: string;
};

type StoredState = {
  userMode: UserMode | null;
  elders: Elder[];
  tasks: Task[];
  notifications: NotificationItem[];
  messages: Message[];
  elderMessages: Message[];
  currentElderId: string | null;
  assistantProfile: AssistantProfile;
  assistantMemories: AssistantMemory[];
  memoryEntries: MemoryEntry[];
  callInsights: CallInsight[];
};

// ─── 身份锁定模型（2025-01新增）─────────────────────────────────
// 目的：统一「谁在用、以谁的身份调用」，避免「奶奶/妈妈」称呼错乱。
// 持久化 key 与业务数据独立，不受 MEM_DATA_VERSION 重置影响。
type Identity = {
  role: "child" | "elder";
  personId: string; // child → caregiverId；elder → elderId
  phone?: string;    // 手机号登录
  userId?: string;   // 身份ID（用于绑定）
  displayName?: string; // 登录时填写的称呼
};

// ─── 用户账号与绑定系统（手机号登录 + ID绑定）──────────────────────
type UserAccount = {
  userId: string;
  phone: string;
  role: "child" | "elder";
  displayName: string;
  boundPartnerId?: string;
  boundPartnerName?: string;
  createdAt: string;
};

type BindingRequest = {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  fromRole: "child" | "elder";
  toUserId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

type Caregiver = {
  id: string;
  displayName: string;
  relation: string;
};

const STORAGE_KEY = "you-dian-dian-ji-demo";
const MEM_DATA_VERSION = "v7_conversational_call";
const IDENTITY_KEY = "memory_bridge_identity_v1";
const USERS_REGISTRY_KEY = "yddj_users_registry";
const BINDING_REQUESTS_KEY = "yddj_binding_requests";

// 根据手机号生成身份ID（取后4位 + 前缀）
function generateUserId(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-4);
  return `YD-${digits || "0000"}`;
}

// 用户注册表操作（模拟后端）
function loadUsersRegistry(): Record<string, UserAccount> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USERS_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsersRegistry(registry: Record<string, UserAccount>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(registry));
}

// 绑定请求操作
function loadBindingRequests(): BindingRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BINDING_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBindingRequests(requests: BindingRequest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BINDING_REQUESTS_KEY, JSON.stringify(requests));
}

// Demo 阶段只有「小雨」一位子女；后续多人可扩充
const CAREGIVERS: Caregiver[] = [
  { id: "user_xiaoyu", displayName: "小雨", relation: "子女" },
];
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "assistant", label: "记忆库" },
  { key: "home", label: "小助理" },
  { key: "tasks", label: "任务" },
];

const RELATION_OPTIONS = ["妈妈", "爸爸", "奶奶", "爷爷", "外婆", "外公", "其他"];
const FOCUS_OPTIONS = ["吃药", "测血糖", "复诊", "带物", "饮食", "回电"];
const COMMUNICATION_OPTIONS = ["温柔一点", "简短一点", "直接一点", "不要太肉麻"];
const QUICK_INPUTS = [
  "帮我每天提醒妈妈吃降压药",
  "明早提醒爸爸测血糖",
  "帮我把一句重话改得温柔点",
  "妈妈最近怎么样了",
];

const ELDER_QUICK_INPUTS = ["我已经吃药了", "电话里没听清，再说一遍", "今天我都做完了", "帮我告诉孩子我挺好的"];

const MEM_SUB_CATS: Record<string, Array<{ key: MemoryCategory; label: string }>> = {
  family_info: [
    { key: "elder_basic", label: "基本信息" },
    { key: "elder_health", label: "健康状况" },
    { key: "elder_habits", label: "生活习惯" },
    { key: "elder_contact", label: "联系方式" },
  ],
  relationship: [
    { key: "rel_emotional", label: "情感纽带" },
    { key: "rel_history", label: "互动历史" },
    { key: "rel_events", label: "重要事件" },
    { key: "rel_preferences", label: "特殊偏好" },
  ],
  chat_style: [
    { key: "chat_language", label: "语言习惯" },
    { key: "chat_expression", label: "表达方式" },
    { key: "chat_focus", label: "关注重点" },
    { key: "chat_taboo", label: "沟通禁忌" },
  ],
};
const MEM_MAIN_TAB_CATS: Record<string, MemoryCategory[]> = {
  family_info: ["about_elder", "about_user", "elder_basic", "elder_health", "elder_habits", "elder_contact", "pending_review"],
  relationship: ["relationship", "rel_emotional", "rel_history", "rel_events", "rel_preferences"],
  chat_style: ["communication_style", "chat_language", "chat_expression", "chat_focus", "chat_taboo"],
};

const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = {
  tone: "温柔陪伴",
  rhythm: "简短清楚",
  initiative: "适度主动",
  signature: "像家里人一样记挂",
};

const STATUS_META: Record<
  TaskStatus,
  { label: string; className: string; dot: string }
> = {
  created: { label: "已创建", className: "bg-stone-100 text-stone-700", dot: "⚪" },
  scheduled: { label: "待提醒", className: "bg-stone-100 text-stone-700", dot: "⚪" },
  sent: { label: "已发起", className: "bg-sky-100 text-sky-700", dot: "🔵" },
  reached: { label: "已触达", className: "bg-sky-100 text-sky-700", dot: "🔵" },
  confirmed: { label: "已确认", className: "bg-emerald-100 text-emerald-700", dot: "🟢" },
  completed: { label: "已完成", className: "bg-emerald-100 text-emerald-700", dot: "🟢" },
  unconfirmed: { label: "待确认", className: "bg-amber-100 text-amber-700", dot: "🟡" },
  timeout: { label: "暂未回应", className: "bg-rose-100 text-rose-700", dot: "🔴" },
  cancelled: { label: "已取消", className: "bg-stone-100 text-stone-700", dot: "⚪" },
  need_review: { label: "待查看", className: "bg-violet-100 text-violet-700", dot: "🟣" },
  not_done: { label: "本次没做", className: "bg-amber-100 text-amber-700", dot: "🟡" },
  postponed: { label: "已延后", className: "bg-amber-100 text-amber-700", dot: "🟡" },
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowLabel() {
  return new Date().toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayKey() {
  return new Date().toLocaleDateString("sv-SE");
}

function stampMessage(message: Message): Message {
  return {
    ...message,
    createdAt: message.createdAt ?? nowLabel(),
    dayKey: message.dayKey ?? todayKey(),
  };
}

function buildTranscriptLines(messages: Message[], audience: "child" | "elder") {
  const roleMap =
    audience === "child"
      ? { user: "子女", assistant: "念念" }
      : { user: "长辈", assistant: "念念" };

  return messages.slice(-12).map((message) => `${roleMap[message.role]}：${message.content}`);
}

function buildAssistantMemory(
  dayKey: string,
  childMessages: Message[],
  elderMessages: Message[],
  currentElder: Elder | null,
): AssistantMemory {
  const dateLabel = dayKey.replaceAll("-", ".");
  const childTranscript = buildTranscriptLines(childMessages, "child");
  const elderTranscript = buildTranscriptLines(elderMessages, "elder");
  const recentHighlights = [...childTranscript.slice(-2), ...elderTranscript.slice(-2)].join("；");
  const focusName = currentElder?.relation ?? currentElder?.displayName ?? "家里长辈";
  const summary = recentHighlights
    ? `${dateLabel} 主要围绕${focusName}沟通。子女端${childMessages.length}条，长辈端${elderMessages.length}条。最近提到：${recentHighlights}`
    : `${dateLabel} 主要围绕${focusName}沟通，今天还没有形成明确事项。`;

  return {
    dayKey,
    dateLabel,
    summary,
    childTranscript,
    elderTranscript,
    updatedAt: nowLabel(),
  };
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, "");
}

function inferTaskType(text: string): TaskType {
  if (text.includes("吃药") || text.includes("降压药")) return "medication";
  if (text.includes("血糖") || text.includes("血压") || text.includes("测")) {
    return "health_measurement";
  }
  if (text.includes("带") || text.includes("医保卡") || text.includes("病历")) {
    return "bring_items";
  }
  if (text.includes("回电话") || text.includes("回个电话") || text.includes("回电")) {
    return "call_back";
  }
  return "other";
}

function inferIntent(text: string): "create_task" | "rewrite_note" | "query_status" | "add_elder" | "unknown" {
  if (text.includes("温柔") || text.includes("小纸条") || text.includes("说得") || text.includes("改写")) {
    return "rewrite_note";
  }
  if (
    (text.includes("今天") || text.includes("状态") || text.includes("完成")) &&
    (text.includes("任务") || text.includes("确认") || text.includes("完成了吗"))
  ) {
    return "query_status";
  }
  if (text.includes("添加") || text.includes("加一下") || text.includes("新增")) {
    return "add_elder";
  }
  if (text.includes("提醒") || text.includes("记得") || text.includes("回个电话")) {
    return "create_task";
  }
  return "unknown";
}

function buildNicknames(relation: string, displayName: string) {
  const defaults: Record<string, string[]> = {
    妈妈: ["妈", "老妈"],
    爸爸: ["爸", "老爸", "我爸"],
    奶奶: ["奶奶", "奶"],
    爷爷: ["爷爷", "爷"],
    外婆: ["外婆", "姥姥"],
    外公: ["外公", "姥爷"],
  };
  return Array.from(new Set([displayName, relation, ...(defaults[relation] ?? [])]));
}

function detectTargetElders(text: string, elders: Elder[], currentElder: Elder | null) {
  const normalized = normalizeText(text);
  const directMatches = elders.filter((elder) =>
    elder.nicknames.some((alias) => normalized.includes(normalizeText(alias))),
  );

  if (normalized.includes("爸妈")) {
    const parents = elders.filter((elder) => elder.relation === "爸爸" || elder.relation === "妈妈");
    if (parents.length >= 2) return parents;
  }

  if (directMatches.length > 0) return directMatches;
  return currentElder ? [currentElder] : [];
}

function extractQuotedText(text: string) {
  const matched = text.match(/[“"'`](.+?)[”"'`]/);
  return matched?.[1] ?? text;
}

function parseRemindLabel(text: string) {
  const matchers = [
    { regex: /(今晚)\s*(\d{1,2})点/, format: ([label, hour]: string[]) => `${label} ${hour.padStart(2, "0")}:00` },
    { regex: /(明早|明天早上|明天上午)\s*(\d{1,2})点/, format: ([, label, hour]: string[]) => `${label.replace("明天早上", "明早").replace("明天上午", "明早")} ${hour.padStart(2, "0")}:00` },
    { regex: /(下午)\s*(\d{1,2})点/, format: ([label, hour]: string[]) => `${label} ${hour.padStart(2, "0")}:00` },
    { regex: /(晚上)\s*(\d{1,2})点/, format: ([label, hour]: string[]) => `${label} ${hour.padStart(2, "0")}:00` },
    { regex: /(明天去医院前)/, format: ([label]: string[]) => label },
    { regex: /(每天早饭后)/, format: ([label]: string[]) => label },
    { regex: /(今天)\s*(\d{1,2})点/, format: ([label, hour]: string[]) => `${label} ${hour.padStart(2, "0")}:00` },
  ];

  for (const matcher of matchers) {
    const result = text.match(matcher.regex);
    if (result) return matcher.format(result as unknown as string[]);
  }
  return "";
}

function buildTaskContent(text: string, type: TaskType, elderName: string) {
  if (type === "medication") return `提醒${elderName}吃药，听到后说一声"知道了"。`;
  if (type === "health_measurement") return `提醒${elderName}测量并回传结果。`;
  if (type === "bring_items") return text.replace(/提醒/g, "").replace(elderName, elderName).replace(/[。！]/g, "");
  if (type === "call_back") return `提醒${elderName}给家属回个电话。`;
  return text.replace(/[。！]/g, "");
}

function recommendTimeSlots(elder: Elder): string[] {
  const slots: string[] = [];
  const avail = elder.availableTime ?? "08:00-21:00";
  // If elder has specific preferences, prioritize them
  if (avail.includes("20") || avail.includes("21") || avail.includes("晚上")) {
    slots.push("晚饭后 20:00");
  } else {
    slots.push("晚饭后 19:30");
  }
  if (avail.includes("08") || avail.includes("早")) {
    slots.push("早饭后 08:00");
  } else {
    slots.push("上午 09:30");
  }
  if (avail.includes("12") || avail.includes("中午")) {
    slots.push("午饭后 12:30");
  }
  return slots;
}

function formatRelayForDraft(rawRelay: string, elderName: string): string {
  const cleaned = rawRelay.trim().replace(/^就说我/, "").replace(/^告诉她/, "").replace(/^告诉他/, "");
  return cleaned;
}

function buildTaskDrafts(text: string, elders: Elder[], currentElder: Elder | null) {
  const remindLabel = parseRemindLabel(text);
  const targets = detectTargetElders(text, elders, currentElder);

  if (targets.length === 0) {
    return { error: "你想提醒哪位长辈？我先帮你把对象补齐。" };
  }

  if (!remindLabel) {
    return { error: `好的，${targets[0].displayName}这件事我记下了。你希望几点提醒更合适？` };
  }

  const type = inferTaskType(text);
  const drafts: TaskDraft[] = targets.map((elder) => {
    const needResult = type === "health_measurement" || text.includes("告诉我") || text.includes("数值");
    const titleMap: Record<TaskType, string> = {
      medication: `提醒${elder.displayName}吃药`,
      health_measurement: `提醒${elder.displayName}测量`,
      bring_items: `提醒${elder.displayName}带好物品`,
      call_back: `提醒${elder.displayName}回电`,
      other: `提醒${elder.displayName}留意事项`,
    };

    return {
      id: uid("draft"),
      title: titleMap[type],
      type,
      elderId: elder.id,
      elderDisplayName: elder.displayName,
      content: buildTaskContent(text, type, elder.displayName),
      remindLabel,
      repeatRule: text.includes("每天") ? "daily" : "none",
      channel: "电话提醒",
      needConfirmation: true,
      needResult,
      priority: "normal",
      created: false,
    };
  });

  return { drafts };
}

function buildNoteVersions(original: string, elderName: string) {
  const raw = extractQuotedText(original).replace(/[？?！!]/g, "").trim();
  return [
    {
      style: "温柔型",
      text: `${elderName}，记得把这件事做一下呀。你回我一声，我就放心啦。`,
    },
    {
      style: "轻松型",
      text: `${elderName}，别忘了这件事哦。忙完跟我说一声，我就安心了。`,
    },
    {
      style: "直接型",
      text: `${elderName}，记得把“${raw || "这件事"}”处理一下，完了告诉我一声。`,
    },
  ];
}

function summarizeTasks(tasks: Task[], elder?: Elder | null) {
  const targetTasks = elder ? tasks.filter((task) => task.elderId === elder.id) : tasks;
  const completed = targetTasks.filter((task) => task.status === "completed").length;
  const confirmed = targetTasks.filter((task) => task.status === "confirmed").length;
  const pending = targetTasks.filter((task) => task.status === "unconfirmed" || task.status === "scheduled").length;
  const timeout = targetTasks.filter((task) => task.status === "timeout").length;
  const scope = elder ? `${elder.displayName}今天` : "今天";

  return `${scope}惦记了${targetTasks.length}件事呢~已完成${completed}件，已确认${confirmed}件，待跟进${pending}件${timeout ? `，暂未回应${timeout}件` : "。"} `;
}

function buildAssistantPreview(profile: AssistantProfile, elderName: string) {
  const opening =
    profile.tone === "温柔陪伴" ? `${elderName}，今天怎么样呀~` : `${elderName}，我来找你聊天啦~`;
  const reminder =
    profile.rhythm === "简短清楚"
      ? "要紧的事我轻轻提醒你一声哦~"
      : "有要紧的事，我慢慢跟你说呀，不催你的~";
  const followUp =
    profile.initiative === "少打扰"
      ? "你先忙，方便了再回我就好啦~"
      : profile.initiative === "多确认一次"
        ? "要是你一会儿顾不上，我晚点再来问你呀~"
        : "你想跟孩子说什么，也可以让我带句话哦~";

  return `${opening}${reminder}${followUp}`;
}

function buildCareReply(elderName: string) {
  return `${elderName}呀，不着急哦，您听到了回我一声就好啦~要是有啥想跟我说的，随时跟我说呀~`;
}

function rewriteRelayMessage(rawMessage: string, elderName: string, childName?: string): string {
  const cleaned = rawMessage.trim();
  const name = childName ?? "孩子";

  // Common patterns
  if (cleaned.includes("忙") && (cleaned.includes("没空") || cleaned.includes("没时间"))) {
    return `${name}这两天确实忙，可能没顾上打电话。但TA特意让我来问问您，不是不惦记。`;
  }
  if (cleaned.includes("加班")) {
    return `${name}最近加班比较多，可能没顾上联系您。但TA心里一直惦记着，特意让我来问候一声。`;
  }
  if (cleaned.includes("不是不想")) {
    return `${name}让我跟您说，最近确实比较忙，不是不想您，您别多想。`;
  }
  if (cleaned.includes("想你") || cleaned.includes("惦记")) {
    return `${name}让我转告您，TA一直惦记着您，就是最近有点忙不过来。`;
  }
  // Default: wrap with warmth
  return `${name}特意让我转告您：${cleaned}。TA虽然没亲自打电话，但心里一直记挂您。`;
}

type CareTopic = "health" | "daily_life" | "weather" | "food" | "mood" | "family_update";

function pickCareTopic(callCount: number): CareTopic {
  const rotation: CareTopic[] = ["health", "daily_life", "mood", "weather", "food", "family_update"];
  return rotation[callCount % rotation.length];
}

function buildCareQuestion(topic: CareTopic): string {
  const questions: Record<CareTopic, string> = {
    health: `最近身体怎么样呀？有没有哪里不太舒服的，跟我说说嘛~`,
    daily_life: `这两天在干嘛呢？有没有出去逛逛呀？`,
    mood: `今天心情好不好呀？有什么开心的事跟我讲讲嘛~`,
    weather: `最近天气变来变去的，可要记得加减衣服呀，别着凉了~`,
    food: `最近吃饭香不香呀？有没有好好吃饭，可不能随便对付哦~`,
    family_update: `家里最近都挺好吧？有什么需要帮忙的尽管说呀~`,
  };
  return questions[topic];
}

function buildCallScript(task: Task | null, elder: Elder | null, relayMessage?: string) {
  const turns = buildCallTurns(task, elder, relayMessage);
  return turns.map((t) => t.text).join(" ");
}

/**
 * 将通话脚本拆分为多个对话轮次，支持分段播放 + 等待回应。
 * 每个轮次代表念念说的一段话，标注是否需要等待长辈回应。
 */
function buildCallTurns(task: Task | null, elder: Elder | null, relayMessage?: string): CallTurn[] {
  const elderName = elder?.displayName ?? "您";
  const turns: CallTurn[] = [];

  // 轮次1：问候（不等待，短暂停顿后继续）
  turns.push({
    id: "greeting",
    text: `您好呀~我是小雨设置的小助理念念，小雨今天惦记您啦，让我来跟您聊几句~`,
    waitResponse: false,
    topic: "问候",
  });

  // 轮次2：转达消息（可选）
  if (relayMessage) {
    const rewritten = rewriteRelayMessage(relayMessage, elderName);
    turns.push({
      id: "relay",
      text: rewritten,
      waitResponse: false,
      topic: "转达",
    });
  }

  // 轮次3：任务提醒（可选，等待回应确认）
  if (task) {
    let taskText = "";
    if (task.type === "medication") {
      taskText = `对了对了，小雨让我提醒您一下呀，药记得按时吃哦。吃完跟我说一声，我好跟小雨说一声~`;
    } else if (task.type === "health_measurement") {
      const focusList = elder?.healthFocus ?? [];
      const measureHint = focusList.length > 0 ? focusList[0] : "血糖";
      taskText = `小雨还说让我提醒您呀，记得测一下${measureHint}哦。不用着急，等您方便了测一测就好~`;
    } else if (task.type === "call_back") {
      taskText = `小雨说您方便的时候给您回个电话呢，您要是有空就接一下~`;
    } else {
      taskText = `小雨还让我提醒您一下：${task.content}。忙完了告诉我一声就好~`;
    }
    turns.push({
      id: "task",
      text: taskText,
      waitResponse: true,
      topic: "提醒",
    });
  }

  // 轮次4：关心话题（等待回应）
  const topic = pickCareTopic(Date.now() % 6);
  turns.push({
    id: "care",
    text: buildCareQuestion(topic),
    waitResponse: true,
    topic: "关心",
  });

  // 轮次5：结束语（不等待）
  turns.push({
    id: "closing",
    text: `跟您聊天真开心~您要是有什么想跟小雨说的，也可以告诉我呀，我帮您带过去。那我先不打扰您啦，要注意身体哦~`,
    waitResponse: false,
    topic: "结束",
  });

  return turns;
}

/**
 * 根据当前对话轮次返回预设回应按钮，方便长辈一键点击回应。
 */
function getPresetReplies(turnId: string): string[] {
  switch (turnId) {
    case "task":
      return ["好的，我吃了", "等一下再吃", "已经吃过了"];
    case "care":
      return ["挺好的", "还行吧", "有点不舒服"];
    case "relay":
      return ["知道了", "好的", "谢谢念念"];
    case "greeting":
      return ["你好呀", "嗯嗯"];
    default:
      return ["好的", "知道了", "谢谢"];
  }
}

function getLatestTaskForElder(tasks: Task[], elderId: string | null) {
  if (!elderId) return null;
  const relatedTasks = tasks.filter((task) => task.elderId === elderId);
  return relatedTasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

function buildExecutionLog(event: string): TaskLog {
  return { id: uid("log"), time: nowLabel(), event };
}

function buildDemoState(): StoredState {
  const elders: Elder[] = [
    {
      id: "elder_mom",
      relation: "妈妈",
      displayName: "妈妈",
      phone: "13983879081",
      availableTime: "08:30-21:30",
      focus: ["测血糖", "吃药", "复诊"],
      communicationPreference: ["温柔一点", "多聊家常", "别总提病情"],
      responseHabit: "下午比较容易接电话；不喜欢被反复追问健康；聊到家人和辽阳老家会比较开心",
      nicknames: buildNicknames("妈妈", "妈妈"),
      recentResponseAt: "昨天 15:30",
      oneLinePortrait: "嘴上说别管我，聊起老家就停不下来",
      healthFocus: ["血糖", "甲状腺术后", "优甲乐", "运动", "体重"],
      recentSignals: ["最近在西安和爸爸一起", "不太愿意测血糖", "社交变少了"],
      personalityTraits: [
        "蒙古族辽阳人，聊老家话题会开心",
        "不喜欢被反复追问健康",
        "接到子女电话会开心但不说",
        "最近几年社交变少，子女担心心情",
      ],
      relationshipMemories: [
        "妈妈是蒙古族辽阳人，喜欢聊老家",
        "前年甲状腺切除手术，不太愿意提",
        "小雨想让妈妈多运动多测血糖，但妈妈不太配合",
        "妈妈最近几年社交变少了",
        "妈妈最近在西安和爸爸一起生活",
      ],
    },
    {
      id: "elder_dad",
      relation: "爸爸",
      displayName: "爸爸",
      phone: "13800002222",
      availableTime: "07:00-22:00",
      focus: ["测血糖", "吃药"],
      communicationPreference: ["直接一点"],
      responseHabit: "上午容易接电话，晚上不怎么看手机",
      nicknames: buildNicknames("爸爸", "爸爸"),
      recentResponseAt: "昨天 20:10",
      oneLinePortrait: "不爱主动说累，总说自己没事",
      healthFocus: ["血糖", "饮食"],
      recentSignals: ["血糖控制得不错"],
      personalityTraits: ["不喜欢被催", "嘴硬心软"],
      relationshipMemories: ["爸爸嘴上不说，但你打电话他会开心很久"],
    },
    {
      id: "elder_grandma",
      relation: "奶奶",
      displayName: "奶奶",
      phone: "13800001111",
      availableTime: "08:00-21:00",
      focus: ["吃药", "测血压"],
      communicationPreference: ["温柔一点", "简短一点"],
      responseHabit: "晚上比较容易接电话",
      nicknames: buildNicknames("奶奶", "奶奶"),
      oneLinePortrait: "嘴上说不用管，接到电话比谁都开心",
      healthFocus: ["血压", "降压药", "睡眠"],
      recentSignals: ["最近提到有点头晕"],
      personalityTraits: [
        "嘴上说不用孩子操心，但接到电话会开心",
        "经常叮嘱小雨按时吃饭",
        "喜欢先聊两句再说正事",
      ],
      relationshipMemories: [
        "奶奶经常叮嘱小雨按时吃饭",
        "奶奶嘴上说不用管，其实盼你回电话",
        "希望你有空回电话",
      ],
    },
  ];

  const tasks: Task[] = [
    {
      id: uid("task"),
      title: "提醒爸爸测血糖",
      type: "health_measurement",
      elderId: "elder_dad",
      elderDisplayName: "爸爸",
      content: "提醒爸爸测血糖，测完告诉我结果。",
      remindLabel: "明早 08:00",
      repeatRule: "none",
      channel: "电话提醒",
      needConfirmation: true,
      needResult: true,
      status: "completed",
      result: "血糖 6.1",
      createdAt: nowLabel(),
      updatedAt: nowLabel(),
      logs: [
        buildExecutionLog("已创建任务"),
        buildExecutionLog("已发起电话提醒"),
        buildExecutionLog("爸爸已接听"),
        buildExecutionLog("爸爸回复：血糖 6.1"),
        buildExecutionLog("状态更新为已完成"),
      ],
    },
    {
      id: uid("task"),
      title: "提醒妈妈吃降压药",
      type: "medication",
      elderId: "elder_mom",
      elderDisplayName: "妈妈",
      content: "提醒妈妈吃降压药，吃完后回我一声。",
      remindLabel: "今晚 20:00",
      repeatRule: "daily",
      channel: "电话提醒",
      needConfirmation: true,
      needResult: false,
      status: "unconfirmed",
      relayMessage: "最近加班，不是不想她",
      createdAt: nowLabel(),
      updatedAt: nowLabel(),
      logs: [
        buildExecutionLog("已创建任务"),
        buildExecutionLog("已设置传话：最近加班，不是不想她"),
        buildExecutionLog("已发起电话提醒"),
        buildExecutionLog("第一次未接通，10 分钟后重试"),
      ],
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: uid("notice"),
      title: "爸爸已完成测血糖",
      detail: "回复：血糖 6.1 呢。你可以放心啦~",
      time: "2 分钟前",
      level: "success",
    },
    {
      id: uid("notice"),
      title: "妈妈暂时还没确认吃药提醒",
      detail: "我已经提醒了两次啦~你可以晚点亲自打个电话哦。",
      time: "10 分钟前",
      level: "warning",
    },
  ];

  const messages: Message[] = [
    {
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: "我会帮你把惦记变成提醒、回执和更温柔的话哦~你突然想起什么，直接跟我说就好啦~",
    },
  ];

  const elderMessages: Message[] = [
    {
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: "你好呀~我是小助理念念，小雨让我来陪您说说话。您有什么想聊的，随时跟我说就好~",
    },
  ];

  return {
    userMode: "child",
    elders,
    tasks,
    notifications,
    messages,
    elderMessages,
    currentElderId: "elder_mom",
    assistantProfile: DEFAULT_ASSISTANT_PROFILE,
    assistantMemories: [
      {
        dayKey: todayKey(),
        dateLabel: todayKey().replaceAll("-", "."),
        summary: "妈妈血糖今天没测，甲状腺药按时吃了；奶奶晚上接了电话，叮嘱你好好吃饭。",
        childTranscript: ["子女：帮我每天提醒妈妈吃降压药"],
        elderTranscript: ["长辈：我已经吃药了"],
        updatedAt: nowLabel(),
      },
    ],
    memoryEntries: [
      // ═══════════════════════════════════════════════
      // 关于子女 (relay_memory → about_user)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "about_user", content: "小雨最近项目上线，经常加班", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "about_user", content: "不太会直接表达关心，但一直很惦记家人", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "about_user", content: "小雨一直想让妈妈多运动、多测血糖，但妈妈不太配合", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "about_user", content: "小雨工作忙但一直惦记妈妈在西安的生活，希望妈妈多出去走走", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 杨艳梅 — 基本信息 (elder_basic)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "elder_basic", content: "妈妈全名杨艳梅，1971年5月30日出生，蒙古族，老家在辽阳", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_basic", content: "妈妈是蒙古族辽阳人，喜欢聊老家的事，聊起来就停不下来", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_basic", content: "妈妈最近在西安和爸爸一起生活，生活节奏比较慢", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 — 健康状况 (health_memory → elder_health)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "elder_health", content: "妈妈前年因甲状腺癌切除了甲状腺，目前需要长期服用优甲乐", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_health", content: "妈妈术后恢复得还行，但一直不太愿意提及手术的事", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_health", content: "妈妈需要每天按时服用优甲乐，不能漏服，这是术后管理的关键", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_health", content: "妈妈患有糖尿病，但不喜欢监测血糖，对测血糖有抵触情绪", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 — 生活习惯 (routine_memory → elder_habits)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "elder_habits", content: "妈妈几乎不运动，体重偏重，但直接提减肥会引起反感", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_habits", content: "妈妈最近几年很少向外社交，子女担心她的心情和社交状态", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_habits", content: "妈妈不太配合多运动、多测血糖的建议，需要用关心而非命令的方式", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 — 联系方式 (preference_memory → elder_contact)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "elder_contact", content: "妈妈下午比较容易接电话；不喜欢被反复追问健康状况", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_contact", content: "妈妈的手机号是13983879081，可以打电话也可以发App消息", importance: "low", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_contact", content: "妈妈一般在早上8:30到晚上9:30之间比较方便接听", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 — 关系记忆 (relationship_memory → rel_*)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "relationship", content: "妈妈嘴上说别管我，其实盼你回电话", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "rel_emotional", content: "妈妈最近几年社交变少了，子女比较担心她的心情", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "rel_emotional", content: "妈妈接到子女电话会开心但不说出来，内心其实很盼望", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "rel_events", content: "前年妈妈做甲状腺切除手术是家里的一件大事，家人都很牵挂", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "rel_preferences", content: "聊到家人和辽阳老家，妈妈会比较开心，是拉近关系的好话题", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 — 沟通偏好 (preference_memory → chat_*)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "chat_expression", content: "妈妈希望被温柔对待，多聊家常，别总提病情", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "chat_expression", content: "语气要温暖轻松，像闺女唠嗑一样，不要说教", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "chat_focus", content: "先聊西安的生活、聊爸爸、聊家常，自然地关心健康，不要一上来就问血糖", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "chat_taboo", content: "不要说'你必须测血糖'，不要用命令的语气", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "chat_taboo", content: "不要过度强调病情严重性，不要说'甲状腺癌'这个词", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },
      { id: uid("mem"), category: "chat_taboo", content: "不要说'你太胖了需要减肥'", importance: "high", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于妈妈 — 情绪信号 (emotional_signal → pending_review)
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "pending_review", content: "妈妈最近可能睡眠不好", importance: "medium", elderId: "elder_mom", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于奶奶
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "elder_basic", content: "奶奶长期关注血压，晚上需要吃降压药", importance: "high", elderId: "elder_grandma", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_contact", content: "奶奶晚上比较容易接电话", importance: "medium", elderId: "elder_grandma", createdAt: nowLabel() },
      { id: uid("mem"), category: "rel_emotional", content: "奶奶经常叮嘱小雨按时吃饭", importance: "high", elderId: "elder_grandma", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 关于爸爸
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "elder_basic", content: "爸爸上午容易接电话，晚上不怎么看手机", importance: "medium", elderId: "elder_dad", createdAt: nowLabel() },
      { id: uid("mem"), category: "elder_health", content: "爸爸在关注血糖和饮食控制", importance: "medium", elderId: "elder_dad", createdAt: nowLabel() },
      { id: uid("mem"), category: "rel_emotional", content: "爸爸嘴上不说，但你打电话他会开心很久", importance: "high", elderId: "elder_dad", createdAt: nowLabel() },

      // ═══════════════════════════════════════════════
      // 通用沟通风格
      // ═══════════════════════════════════════════════
      { id: uid("mem"), category: "communication_style", content: "转达时不要太肉麻，用惦记比担心更合适", importance: "low", createdAt: nowLabel() },
    ],
    callInsights: [
      {
        id: uid("insight"),
        taskId: "demo_insight_1",
        elderId: "elder_dad",
        elderDisplayName: "爸爸",
        factualSummary: "爸爸今天测了血糖，结果是 6.1，控制得不错。听说你最近忙，他说了句别太累。",
        relationshipInsight: "爸爸嘴上不怎么表达，但他接电话时语气是开心的。他不太会主动说想你，但每次你联系他，他都会高兴很久。",
        suggestedAction: "爸爸血糖稳定，你可以放心。这周末有空的话，给他回个电话，他会很高兴。",
        suggestedMessage: "爸，听说你血糖控制得挺好的，辛苦你了。",
        createdAt: nowLabel(),
      },
    ],
  };
}

function getNoticeClass(level: NotificationLevel) {
  const map: Record<NotificationLevel, string> = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    info: "bg-sky-50 text-sky-700",
    review: "bg-violet-50 text-violet-700",
  };
  return map[level];
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${meta.className}`}>
      <span>{meta.dot}</span>
      {meta.label}
    </span>
  );
}

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [userMode, setUserMode] = useState<UserMode | null>(null);
  // 身份锁定：选过身份后下次进来不需要重选
  const [identity, setIdentity] = useState<Identity | null>(null);
  // 登录页内部步骤：'phone' 输入手机号，'info' 填写信息选角色
  const [loginStep, setLoginStep] = useState<"phone" | "info">("phone");
  // 右上角“我的身份”卡是否展开
  const [identityCardOpen, setIdentityCardOpen] = useState(false);
  // 手机号登录表单
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginRole, setLoginRole] = useState<"child" | "elder">("child");
  // 绑定系统
  const [bindingInputId, setBindingInputId] = useState("");
  const [bindingRequests, setBindingRequests] = useState<BindingRequest[]>([]);
  const [myAccount, setMyAccount] = useState<UserAccount | null>(null);
  const [bindingToast, setBindingToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [isPeopleDrawerOpen, setIsPeopleDrawerOpen] = useState(false);
  const [elders, setElders] = useState<Elder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [elderMessages, setElderMessages] = useState<Message[]>([]);
  const [assistantMemories, setAssistantMemories] = useState<AssistantMemory[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>(() => buildDemoState().memoryEntries);
  const [currentElderId, setCurrentElderId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [elderDetailId, setElderDetailId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [newMemoryText, setNewMemoryText] = useState("");
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>("about_elder");
  const [memMainTab, setMemMainTab] = useState<"family_info" | "relationship" | "chat_style">("family_info");
  const [memSubTab, setMemSubTab] = useState<string>("all");
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingMemText, setEditingMemText] = useState("");
  const [showAddMem, setShowAddMem] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFilePreview, setImportFilePreview] = useState<string | null>(null);
  // 导入记忆 - 增强版状态
  type ImportCandidateWithSelection = ImportCandidate & { id: string; selected: boolean };
  const [importStatus, setImportStatus] = useState<"idle" | "uploading" | "parsing" | "extracting" | "done" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importCandidates, setImportCandidates] = useState<ImportCandidateWithSelection[]>([]);
  const [importRawText, setImportRawText] = useState<string>("");
  const [importFileMeta, setImportFileMeta] = useState<{ name: string; size: number; parser: string; durationMs: number } | null>(null);
  const [importCandidateTab, setImportCandidateTab] = useState<"family_info" | "relationship" | "chat_style">("family_info");
  const [ocrAvailable, setOcrAvailable] = useState<boolean | null>(null);
  // 手动录入模式：用户放弃候选，改成手贴原文
  const [importManualMode, setImportManualMode] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingCandidateText, setEditingCandidateText] = useState("");
  const [addMemSubCat, setAddMemSubCat] = useState<MemoryCategory>("elder_basic");
  const [taskCreateFlow, setTaskCreateFlow] = useState<TaskCreateFlow>({ step: "idle", rawText: "", targets: [], taskType: "other", remindLabel: "", repeatRule: "none", relayMessage: "", recommendedSlots: [] });
  const [callInsights, setCallInsights] = useState<CallInsight[]>([]);
  const [input, setInput] = useState("");
  const [elderInput, setElderInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isElderReplying, setIsElderReplying] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [showAddElder, setShowAddElder] = useState(false);
  const [editingElderId, setEditingElderId] = useState<string | null>(null);
  const [assistantProfile, setAssistantProfile] = useState<AssistantProfile>(DEFAULT_ASSISTANT_PROFILE);
  const [callSession, setCallSession] = useState<CallSession>({
    open: false,
    audience: "child",
    taskId: null,
    elderId: null,
    sessionId: null,
    phase: "dialing",
    callHistory: [],
  });
  const [callInput, setCallInput] = useState("");
  const [schedulerResult, setSchedulerResult] = useState<string | null>(null);

  // TTS for elder side call
  const elderTTS = useSpeechSynthesis();
  const [elderForm, setElderForm] = useState<ElderFormState>({
    relation: "妈妈",
    displayName: "",
    phone: "",
    availableTime: "08:00-21:00",
    focus: ["吃药"],
    communicationPreference: ["温柔一点"],
    responseHabit: "",
  });

  // ── Auto-scroll refs ──
  const childChatScrollRef = useRef<HTMLDivElement>(null);
  const elderChatScrollRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef({ child: 0, elder: 0 });

  // 导入记忆 - 模态框打开时探活 OCR 服务
  useEffect(() => {
    if (!showImportModal) {
      setOcrAvailable(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/import-memory/health", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setOcrAvailable(false);
          return;
        }
        const data = (await res.json()) as { ocrAvailable: boolean };
        if (!cancelled) setOcrAvailable(data.ocrAvailable);
      } catch {
        if (!cancelled) setOcrAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showImportModal]);

  // 导入记忆 - handler 们
  const resetImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportText("");
    setImportFilePreview(null);
    setImportStatus("idle");
    setImportError(null);
    setImportCandidates([]);
    setImportRawText("");
    setImportFileMeta(null);
    setImportCandidateTab("family_info");
    setImportManualMode(false);
    setEditingCandidateId(null);
    setEditingCandidateText("");
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setImportStatus("error");
      setImportError("文件过大（10MB 上限），请压缩后重试");
      return;
    }
    if (file.type.startsWith("image/")) {
      setImportFilePreview(URL.createObjectURL(file));
    } else {
      setImportFilePreview(null);
    }
    setImportStatus("uploading");
    setImportError(null);
    setImportFileMeta({ name: file.name, size: file.size, parser: "上传中", durationMs: 0 });
    setImportCandidates([]);

    try {
      setImportStatus("parsing");
      const form = new FormData();
      form.append("file", file);
      const currentElder = elders.find((e) => e.id === currentElderId);
      if (currentElder?.displayName) form.append("elderName", currentElder.displayName);

      const res = await fetch("/api/import-memory", { method: "POST", body: form });
      const data = (await res.json()) as {
        rawText?: string;
        candidates?: Array<{ id: string; category: MemoryCategoryValue; content: string; evidence: string; confidence: number }>;
        parser?: string;
        durationMs?: number;
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        setImportStatus("error");
        setImportError(data.error ?? "上传失败");
        setImportFileMeta(null);
        return;
      }

      setImportStatus("extracting");
      // candidates 是 LLM 抽取结果（API 已调过 LLM）
      const rawText = data.rawText ?? "";
      const cands = (data.candidates ?? []).map((c) => ({
        ...c,
        category: c.category as MemoryCategory,
        selected: true,
      }));
      setImportRawText(rawText);
      setImportCandidates(cands);
      setImportFileMeta({
        name: file.name,
        size: file.size,
        parser: data.parser ?? "unknown",
        durationMs: data.durationMs ?? 0,
      });
      setImportStatus("done");
      setImportCandidateTab(cands[0] ? MAIN_TAB_BY_CATEGORY[cands[0].category] : "family_info");
    } catch (err) {
      setImportStatus("error");
      setImportError(err instanceof Error ? err.message : "网络错误");
      setImportFileMeta(null);
    }
  }, [elders, currentElderId]);

  const confirmImportCandidates = useCallback(() => {
    const selected = importCandidates.filter((c) => c.selected);
    if (selected.length === 0) return;
    setMemoryEntries((prev) => [
      ...prev,
      ...selected.map((c) => ({
        id: uid("mem"),
        category: c.category,
        content: c.content,
        source: "import_ocr",
        importance: "medium" as const,
        createdAt: nowLabel(),
      })),
    ]);
    resetImportModal();
  }, [importCandidates, resetImportModal]);

  const confirmManualImport = useCallback(() => {
    const text = importText.trim();
    if (!text) return;
    const chunks = text.split(/\n\n+/).filter((s) => s.trim() && !s.startsWith("[待接入"));
    const entries = chunks.length > 0 ? chunks : [text];
    setMemoryEntries((prev) => [
      ...prev,
      ...entries.map((chunk) => ({
        id: uid("mem"),
        category: addMemSubCat,
        content: chunk.trim(),
        source: "import_ocr",
        importance: "medium" as const,
        createdAt: nowLabel(),
      })),
    ]);
    resetImportModal();
  }, [importText, addMemSubCat, resetImportModal]);


  useEffect(() => {
    const storedDataVer = window.localStorage.getItem(STORAGE_KEY + "_ver");
    const needsFullReset = storedDataVer !== MEM_DATA_VERSION;

    if (needsFullReset) {
      // ── 版本不匹配：强制重置整个数据集为最新 buildDemoState ──
      const demo = buildDemoState();
      setUserMode(demo.userMode);
      setElders(demo.elders);
      setTasks(demo.tasks);
      setNotifications(demo.notifications);
      setMessages(demo.messages.map(stampMessage));
      setElderMessages(demo.elderMessages.map(stampMessage));
      setCurrentElderId(demo.currentElderId);
      setAssistantProfile(demo.assistantProfile);
      setAssistantMemories(demo.assistantMemories ?? []);
      setMemoryEntries(demo.memoryEntries);
      setCallInsights(demo.callInsights ?? []);
      window.localStorage.setItem(STORAGE_KEY + "_ver", MEM_DATA_VERSION);
    } else {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as StoredState;
        setUserMode(parsed.userMode ?? null);
        setElders(parsed.elders);
        setTasks(parsed.tasks);
        setNotifications(parsed.notifications);
        setMessages((parsed.messages ?? []).map(stampMessage));
        setElderMessages((parsed.elderMessages ?? []).map(stampMessage));
        setCurrentElderId(parsed.currentElderId);
        setAssistantProfile(parsed.assistantProfile ?? DEFAULT_ASSISTANT_PROFILE);
        setAssistantMemories(parsed.assistantMemories ?? []);
        if (parsed.memoryEntries && parsed.memoryEntries.length > 0) {
          setMemoryEntries(parsed.memoryEntries);
        }
        if (parsed.callInsights) setCallInsights(parsed.callInsights);
      }
    }
    setHydrated(true);
  }, []);

  // ─── 身份锁定加载（优先级：URL 参数 > localStorage IDENTITY_KEY）─────────────────────────────────────
  // 独立于业务数据 load，避免被 demo.userMode = 'child' 覆盖。
  useEffect(() => {
    if (typeof window === "undefined") return;
    let next: Identity | null = null;
    // 1. URL
    try {
      const url = new URL(window.location.href);
      const urlRole = url.searchParams.get("role");
      const urlPersonId = url.searchParams.get("personId");
      if ((urlRole === "child" || urlRole === "elder") && urlPersonId) {
        next = { role: urlRole, personId: urlPersonId };
      }
    } catch {
      // URL 解析失败忽略
    }
    // 2. localStorage
    if (!next) {
      try {
        const saved = window.localStorage.getItem(IDENTITY_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Identity;
          if ((parsed.role === "child" || parsed.role === "elder") && parsed.personId) {
            next = parsed;
          }
        }
      } catch {
        // localStorage 解析失败忽略
      }
    }
    if (next) {
      setIdentity(next);
      setUserMode(next.role);
      if (next.role === "elder") {
        setCurrentElderId(next.personId);
      }
      // 加载用户账号信息和绑定请求
      if (next.userId) {
        const registry = loadUsersRegistry();
        const account = registry[next.userId];
        if (account) setMyAccount(account);
        const allRequests = loadBindingRequests();
        setBindingRequests(allRequests.filter(
          (r) => r.toUserId === next.userId || r.fromUserId === next.userId,
        ));
      }
    } else {
      // 没有身份 → 强制走登录页，避免被 demo.userMode 默认 "child" 覆盖
      setUserMode(null);
    }
  }, []);

  // identity 持久化
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (identity) {
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } else {
      window.localStorage.removeItem(IDENTITY_KEY);
    }
  }, [identity]);

  // 选择身份 → 同步到 userMode / currentElderId / URL
  const selectIdentity = useCallback((role: "child" | "elder", personId: string) => {
    const next: Identity = { role, personId };
    setIdentity(next);
    setUserMode(role);
    if (role === "elder") {
      setCurrentElderId(personId);
    }
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("role", role);
        url.searchParams.set("personId", personId);
        window.history.replaceState(null, "", url.toString());
      } catch {
        // URL 同步失败不阻断
      }
    }
  }, []);

  // 手机号登录
  const loginWithPhone = useCallback(() => {
    const phone = loginPhone.trim();
    const name = loginName.trim();
    if (!phone || !name) return;

    const userId = generateUserId(phone);
    const role = loginRole;

    // 注册/更新用户账号（模拟后端）
    const registry = loadUsersRegistry();
    const account: UserAccount = {
      userId,
      phone,
      role,
      displayName: name,
      boundPartnerId: registry[userId]?.boundPartnerId,
      boundPartnerName: registry[userId]?.boundPartnerName,
      createdAt: registry[userId]?.createdAt ?? nowLabel(),
    };
    registry[userId] = account;
    saveUsersRegistry(registry);
    setMyAccount(account);

    // 同步 identity
    const personId = role === "child" ? `user_${userId}` : `elder_${userId}`;
    const next: Identity = { role, personId, phone, userId, displayName: name };
    setIdentity(next);
    setUserMode(role);

    // 加载与此用户相关的绑定请求
    const allRequests = loadBindingRequests();
    const myRequests = allRequests.filter(
      (r) => r.toUserId === userId || r.fromUserId === userId,
    );
    setBindingRequests(myRequests);
  }, [loginPhone, loginName, loginRole]);

  // 刷新当前用户的账号信息和绑定请求
  const refreshAccountInfo = useCallback(() => {
    if (!identity?.userId) return;
    const registry = loadUsersRegistry();
    const account = registry[identity.userId];
    if (account) setMyAccount(account);
    const allRequests = loadBindingRequests();
    const myRequests = allRequests.filter(
      (r) => r.toUserId === identity.userId || r.fromUserId === identity.userId,
    );
    setBindingRequests(myRequests);
  }, [identity?.userId]);

  // 发送绑定请求
  const sendBindingRequest = useCallback(() => {
    const targetId = bindingInputId.trim().toUpperCase();
    if (!targetId || !identity?.userId) return;

    if (targetId === identity.userId) {
      setBindingToast("不能绑定自己哦~");
      setTimeout(() => setBindingToast(null), 2500);
      return;
    }

    // 检查是否已绑定
    if (myAccount?.boundPartnerId === targetId) {
      setBindingToast("已经绑定过了~");
      setTimeout(() => setBindingToast(null), 2500);
      return;
    }

    // 检查目标用户是否注册
    const registry = loadUsersRegistry();
    if (!registry[targetId]) {
      setBindingToast(`未找到ID为 ${targetId} 的用户，请确认对方已注册`);
      setTimeout(() => setBindingToast(null), 3000);
      return;
    }

    // 检查是否已有 pending 请求
    const allRequests = loadBindingRequests();
    const existing = allRequests.find(
      (r) => r.fromUserId === identity.userId && r.toUserId === targetId && r.status === "pending",
    );
    if (existing) {
      setBindingToast("已发送过请求，正在等待对方确认~");
      setTimeout(() => setBindingToast(null), 2500);
      return;
    }

    // 创建请求
    const newRequest: BindingRequest = {
      id: uid("bind"),
      fromUserId: identity.userId,
      fromDisplayName: identity.displayName ?? "",
      fromRole: identity.role,
      toUserId: targetId,
      status: "pending",
      createdAt: nowLabel(),
    };
    allRequests.push(newRequest);
    saveBindingRequests(allRequests);

    setBindingRequests(allRequests.filter(
      (r) => r.toUserId === identity.userId || r.fromUserId === identity.userId,
    ));
    setBindingInputId("");
    setBindingToast(`绑定请求已发送给 ${targetId}，等对方通过即可绑定~`);
    setTimeout(() => setBindingToast(null), 3000);
  }, [bindingInputId, identity, myAccount]);

  // 同意绑定请求
  const approveBinding = useCallback((requestId: string) => {
    if (!identity?.userId) return;
    const allRequests = loadBindingRequests();
    const req = allRequests.find((r) => r.id === requestId);
    if (!req || req.toUserId !== identity.userId) return;

    // 更新请求状态
    req.status = "approved";
    saveBindingRequests(allRequests);

    // 双向绑定
    const registry = loadUsersRegistry();
    const myAcc = registry[identity.userId];
    const partnerAcc = registry[req.fromUserId];
    if (myAcc) {
      myAcc.boundPartnerId = req.fromUserId;
      myAcc.boundPartnerName = req.fromDisplayName;
      registry[identity.userId] = myAcc;
    }
    if (partnerAcc) {
      partnerAcc.boundPartnerId = identity.userId;
      partnerAcc.boundPartnerName = identity.displayName ?? "";
      registry[req.fromUserId] = partnerAcc;
    }
    saveUsersRegistry(registry);

    refreshAccountInfo();
    setBindingToast(`已通过 ${req.fromDisplayName} 的绑定请求，现在可以互动了~`);
    setTimeout(() => setBindingToast(null), 3000);
  }, [identity, refreshAccountInfo]);

  // 拒绝绑定请求
  const rejectBinding = useCallback((requestId: string) => {
    if (!identity?.userId) return;
    const allRequests = loadBindingRequests();
    const req = allRequests.find((r) => r.id === requestId);
    if (!req || req.toUserId !== identity.userId) return;

    req.status = "rejected";
    saveBindingRequests(allRequests);
    refreshAccountInfo();
    setBindingToast("已拒绝绑定请求");
    setTimeout(() => setBindingToast(null), 2500);
  }, [identity, refreshAccountInfo]);

  // 退出身份 / 重选
  const clearIdentity = useCallback(() => {
    setIdentity(null);
    setUserMode(null);
    setMyAccount(null);
    setBindingRequests([]);
    setBindingInputId("");
    setLoginPhone("");
    setLoginName("");
    setLoginStep("phone");
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("role");
        url.searchParams.delete("personId");
        window.history.replaceState(null, "", url.toString());
      } catch {
        // URL 清除失败不阻断
      }
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot: StoredState = {
      userMode,
      elders,
      tasks,
      notifications,
      messages,
      elderMessages,
      currentElderId,
      assistantProfile,
      assistantMemories,
      memoryEntries,
      callInsights,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [hydrated, userMode, elders, tasks, notifications, messages, elderMessages, currentElderId, assistantProfile, assistantMemories, memoryEntries, callInsights]);

  const currentElder = useMemo(
    () => elders.find((elder) => elder.id === currentElderId) ?? null,
    [elders, currentElderId],
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const latestElderTask = useMemo(
    () => getLatestTaskForElder(tasks, currentElderId),
    [tasks, currentElderId],
  );

  const currentCallTask = useMemo(
    () => tasks.find((task) => task.id === callSession.taskId) ?? latestElderTask,
    [tasks, callSession.taskId, latestElderTask],
  );

  const currentSummary = useMemo(() => summarizeTasks(tasks, currentElder), [tasks, currentElder]);

  // Proactive care suggestions (Step 5) — warm, actionable, no guilt-trip
  const proactiveSuggestions = useMemo(() => {
    const suggestions: { text: string; action?: string; elderId?: string }[] = [];
    const timeoutTasks = tasks.filter((t) => t.status === "timeout");
    const unconfirmedTasks = tasks.filter((t) => t.status === "unconfirmed");
    const completedToday = tasks.filter((t) => t.status === "completed" || t.status === "confirmed");

    // Timeout: elder didn't pick up → suggest calling personally
    if (timeoutTasks.length > 0) {
      const t = timeoutTasks[0];
      suggestions.push({
        text: `今天给${t.elderDisplayName}打了电话，TA没接到。要是你方便的话，直接给TA回一个会更放心。`,
        action: "打电话",
        elderId: t.elderId,
      });
    }

    // Waiting for confirmation → reassure, no action needed
    if (unconfirmedTasks.length > 0 && timeoutTasks.length === 0) {
      const t = unconfirmedTasks[0];
      suggestions.push({
        text: `已经提醒了${t.elderDisplayName}，正在等TA回复。你先忙你的，有消息我第一时间告诉你。`,
      });
    }

    // Completed today + has insight → suggest follow-up action
    if (completedToday.length > 0 && callInsights.length > 0 && suggestions.length < 2) {
      const latest = callInsights[0];
      if (latest.suggestedAction) {
        suggestions.push({
          text: latest.suggestedAction,
          action: latest.suggestedMessage ? "用这句" : undefined,
          elderId: latest.elderId,
        });
      }
    }

    // No recent contact → gentle nudge with time-bound suggestion
    if (suggestions.length === 0 && elders.length > 0) {
      const elder = currentElder ?? elders[0];
      const recentResponse = elder.recentResponseAt;
      if (!recentResponse || recentResponse.includes("暂未") || recentResponse.includes("未")) {
        suggestions.push({
          text: `这几天还没和${elder.displayName}聊过。如果你今天有 3 分钟，可以给TA回个电话，不用聊很久。`,
          action: "打电话",
          elderId: elder.id,
        });
      }
    }

    return suggestions.slice(0, 2);
  }, [tasks, elders, currentElder, callInsights]);

  const callProgressSteps = [
    {
      key: "dialing",
      label: "发起提醒",
      hint: "正在联系长辈",
      active: callSession.phase === "dialing",
      done: true,
      onClick: () => setCallSession((prev) => ({ ...prev, phase: "dialing" })),
    },
    {
      key: "connected",
      label: "已接通",
      hint: "确认对方接起",
      active: callSession.phase === "connected",
      done: callSession.phase === "connected" || callSession.phase === "speaking" || callSession.phase === "listening" || currentCallTask?.status === "reached" || currentCallTask?.status === "confirmed" || currentCallTask?.status === "completed",
      onClick: () => updateCallPhase("connected"),
    },
    {
      key: "confirmed",
      label: "已确认",
      hint: "知道了、收到了",
      active: currentCallTask?.status === "confirmed",
      done: currentCallTask?.status === "confirmed" || currentCallTask?.status === "completed",
      onClick: () => {
        if (!currentCallTask) return;
        applyTaskStatus(currentCallTask, "confirmed", "电话已确认");
        closeCall();
      },
    },
    {
      key: "completed",
      label: "已完成",
      hint: "任务已经做完",
      active: currentCallTask?.status === "completed",
      done: currentCallTask?.status === "completed",
      onClick: () => {
        if (!currentCallTask) return;
        applyTaskStatus(currentCallTask, "completed", "电话回访确认已完成");
        closeCall();
      },
    },
  ];

  useEffect(() => {
    if (!hydrated) return;

    const dayKey = todayKey();
    const todayChildMessages = messages.filter((message) => (message.dayKey ?? dayKey) === dayKey);
    const todayElderMessages = elderMessages.filter((message) => (message.dayKey ?? dayKey) === dayKey);

    if (todayChildMessages.length === 0 && todayElderMessages.length === 0) return;

    const nextMemory = buildAssistantMemory(dayKey, todayChildMessages, todayElderMessages, currentElder);
    setAssistantMemories((prev) => {
      const merged = [...prev.filter((item) => item.dayKey !== dayKey), nextMemory];
      return merged.sort((a, b) => a.dayKey.localeCompare(b.dayKey)).slice(-14);
    });
  }, [hydrated, messages, elderMessages, currentElder]);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tasks],
  );

  // ── Auto-scroll: smoothly scroll to the latest assistant message ──
  const scrollToLatestAssistant = useCallback((immediate = false) => {
    // Don't scroll during active submission
    if (isSubmitting) return;

    const container = userMode === "elder" ? elderChatScrollRef.current : childChatScrollRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>("[data-assistant-message]:last-of-type");
    if (!target) return;

    // Check if already visible near the bottom of viewport
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const distanceFromBottom = containerRect.bottom - targetRect.bottom;
    if (distanceFromBottom >= -80 && distanceFromBottom <= 120) return;

    const targetTop = target.offsetTop - 16;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: immediate ? "auto" : "smooth",
    });
  }, [userMode, isSubmitting]);

  // Scroll when switching tabs back to chat
  useEffect(() => {
    if (activeTab !== "home") return;
    const frame = requestAnimationFrame(() => scrollToLatestAssistant());
    return () => cancelAnimationFrame(frame);
  }, [activeTab, scrollToLatestAssistant]);

  // Scroll when new messages arrive (after API response)
  useEffect(() => {
    const prev = prevMsgCountRef.current;
    const childGrew = messages.length > prev.child;
    const elderGrew = elderMessages.length > prev.elder;
    prevMsgCountRef.current = { child: messages.length, elder: elderMessages.length };

    if (!childGrew && !elderGrew) return;
    if (activeTab !== "home") return;

    const frame = requestAnimationFrame(() => scrollToLatestAssistant());
    return () => cancelAnimationFrame(frame);
  }, [messages, elderMessages, activeTab, scrollToLatestAssistant]);

  // ── 定时轮询：长辈端自动检查到期任务，触发来电 ──
  useEffect(() => {
    // 仅在长辈端且有长辈档案时启用
    if (userMode !== "elder") return;
    if (!currentElder) return;
    // 如果通话界面已经打开，不检查
    if (callSession.open) return;

    let cancelled = false;

    async function checkScheduledCall() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/scheduler/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) return;
        const data = await res.json();
        const triggered = data.triggered ?? [];
        if (triggered.length > 0 && !cancelled) {
          // 有到期的通话任务 → 自动打开来电界面
          // 取第一个触发的任务
          const first = triggered[0];
          if (first && first.callSessionId) {
            // 打开来电界面
            setCallSession({
              open: true,
              audience: "elder",
              taskId: first.taskOccurrenceId ?? null,
              elderId: first.elderId ?? null,  // 新增：从调度器结果获取
              sessionId: null,                  // 初始 null，接通后由 API 返回
              phase: "dialing",
              callHistory: [],
            });
          }
        }
      } catch {
        // 静默失败，下次重试
      }
    }

    // 立即检查一次
    checkScheduledCall();
    // 每 30 秒轮询一次
    const interval = setInterval(checkScheduledCall, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userMode, currentElder, callSession.open]);

  function appendAssistantMessage(message: Message) {
    setMessages((prev) => [...prev, stampMessage(message)]);
  }

  function appendElderMessage(message: Message) {
    setElderMessages((prev) => [...prev, stampMessage(message)]);
  }

  function addNotification(item: Omit<NotificationItem, "id" | "time">) {
    setNotifications((prev) => [
      { id: uid("notice"), time: nowLabel(), ...item },
      ...prev,
    ]);
  }

  function resetForm(relation = "妈妈") {
    setElderForm({
      relation,
      displayName: "",
      phone: "",
      availableTime: "08:00-21:00",
      focus: ["吃药"],
      communicationPreference: ["温柔一点"],
      responseHabit: "",
    });
  }

  function createElder() {
    if (!elderForm.displayName.trim() || !elderForm.phone.trim()) return;

    if (editingElderId) {
      const targetId = editingElderId;
      const updatedDisplayName = elderForm.displayName.trim();
      const updatedRelation = elderForm.relation;
      const updatedPhone = elderForm.phone.trim();
      const updatedAvailableTime = elderForm.availableTime;
      const updatedResponseHabit = elderForm.responseHabit.trim();

      setElders((prev) =>
        prev.map((elder) => {
          if (elder.id !== targetId) return elder;
          return {
            ...elder,
            relation: updatedRelation,
            displayName: updatedDisplayName,
            phone: updatedPhone,
            availableTime: updatedAvailableTime,
            responseHabit: updatedResponseHabit,
            nicknames: buildNicknames(updatedRelation, updatedDisplayName),
          };
        }),
      );

      setTasks((prev) =>
        prev.map((task) => (task.elderId === targetId ? { ...task, elderDisplayName: updatedDisplayName } : task)),
      );

      setEditingElderId(null);
      setShowAddElder(false);
      setActiveTab("profile");
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `好啦~${updatedDisplayName}的档案已经更新好啦~以后有什么要帮忙的随时叫我呀！`,
      });
      return;
    }

    const elder: Elder = {
      id: uid("elder"),
      relation: elderForm.relation,
      displayName: elderForm.displayName.trim(),
      phone: elderForm.phone.trim(),
      availableTime: elderForm.availableTime,
      focus: elderForm.focus,
      communicationPreference: elderForm.communicationPreference,
      responseHabit: elderForm.responseHabit.trim(),
      nicknames: buildNicknames(elderForm.relation, elderForm.displayName.trim()),
      recentResponseAt: "刚刚添加",
    };

    setElders((prev) => [...prev, elder]);
    setCurrentElderId(elder.id);
    setShowAddElder(false);
    setActiveTab("home");
    resetForm(elderForm.relation);
    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `${elder.displayName}加入啦~以后没有特别说明的话，我会先帮你照看TA哦。放心交给我吧~`,
    });
    appendElderMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `你好呀~${elder.displayName}！我是念念呀，以后提醒、电话和小纸条都从我这儿出发哦~有什么事随时叫我！`,
    });
  }

  function beginEditElder(elder: Elder) {
    setEditingElderId(elder.id);
    setShowAddElder(true);
    setActiveTab("profile");
    setElderForm({
      relation: elder.relation,
      displayName: elder.displayName,
      phone: elder.phone,
      availableTime: elder.availableTime,
      focus: elder.focus,
      communicationPreference: elder.communicationPreference,
      responseHabit: elder.responseHabit,
    });
    setCurrentElderId(elder.id);
  }

  function loadDemoData() {
    const demo = buildDemoState();
    setUserMode(demo.userMode);
    setElders(demo.elders);
    setTasks(demo.tasks);
    setNotifications(demo.notifications);
    setMessages(demo.messages.map(stampMessage));
    setElderMessages(demo.elderMessages.map(stampMessage));
    setAssistantMemories(demo.assistantMemories ?? []);
    setMemoryEntries(demo.memoryEntries ?? []);
    setCurrentElderId(demo.currentElderId);
    setAssistantProfile(demo.assistantProfile);
    setCallInsights(demo.callInsights ?? []);
    setActiveTab("home");
  }

  function markDraftCreated(draftId: string) {
    setMessages((prev) =>
      prev.map((message) => ({
        ...message,
        drafts: message.drafts?.map((draft) =>
          draft.id === draftId ? { ...draft, created: true } : draft,
        ),
      })),
    );
  }

  function createTaskFromDraft(draft: TaskDraft) {
    if (draft.created) return;

    const initLogs: TaskLog[] = [buildExecutionLog("已创建任务"), buildExecutionLog("已进入待提醒队列")];
    if (draft.relayMessage) {
      initLogs.push(buildExecutionLog(`已设置传话：${draft.relayMessage}`));
    }

    const nextTask: Task = {
      id: uid("task"),
      title: draft.title,
      type: draft.type,
      elderId: draft.elderId,
      elderDisplayName: draft.elderDisplayName,
      content: draft.content,
      remindLabel: draft.remindLabel,
      repeatRule: draft.repeatRule,
      channel: draft.channel,
      needConfirmation: draft.needConfirmation,
      needResult: draft.needResult,
      status: "scheduled",
      relayMessage: draft.relayMessage || undefined,
      createdAt: nowLabel(),
      updatedAt: nowLabel(),
      logs: initLogs,
    };

    setTasks((prev) => [nextTask, ...prev]);
    setSelectedTaskId(nextTask.id);
    setActiveTab("tasks");
    markDraftCreated(draft.id);
    addNotification({
      title: `${draft.elderDisplayName}的提醒已创建`,
      detail: `${draft.remindLabel}会通过${draft.channel}触达${draft.relayMessage ? `，并帮你传话：${draft.relayMessage}` : ""}。`,
      level: "info",
    });
    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `帮你排好啦~到了${draft.remindLabel}，我会先联系${draft.elderDisplayName}的。${draft.relayMessage ? `你说的那句"${draft.relayMessage}"，我也帮你转告给TA呀~` : "你放心交给我吧~"}`,
    });
  }

  function updateTask(taskId: string, updater: (task: Task) => Task) {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        return updater(task);
      }),
    );
  }

  function applyTaskStatus(task: Task, status: TaskStatus, result?: string) {
    updateTask(task.id, (current) => {
      const logs = [...current.logs];
      // T0 修复：事件 log 不要写死“回复：知道了”，会令子女误以为长辈真说了
      // 改为 “接通了电话” 或 “回复：<真实内容>”
      let event = "状态已更新";
      if (status === "reached") event = `${current.elderDisplayName}已接听，提醒已触达`;
      if (status === "confirmed") event = result ? `${current.elderDisplayName}回复：${result}` : `${current.elderDisplayName}接通了电话`;
      if (status === "completed") event = `${current.elderDisplayName}回复：${result ?? "做完了"}`;
      if (status === "need_review") event = `${current.elderDisplayName}有一条回复待查看`;
      if (status === "timeout") event = "两次提醒后仍未确认，已通知家属";
      if (status === "not_done") event = result ? `${current.elderDisplayName}回复：${result}` : `${current.elderDisplayName}这次还没做`;
      if (status === "postponed") event = result ? `${current.elderDisplayName}回复：${result}` : `${current.elderDisplayName}需要再提醒一次`;

      const nextTask = {
        ...current,
        status,
        result,
        updatedAt: nowLabel(),
        logs: [...logs, buildExecutionLog(event)],
      };
      return nextTask;
    });

    if (status === "reached") {
      addNotification({
        title: `${task.elderDisplayName}已接到提醒`,
        detail: `${task.title}已经触达啦，接下来等TA确认就好~`,
        level: "info",
      });
    }

    // ─── Step 4 & 5: Insight generation + warm receipt ───────────────
    // T0 修复：去除“知道了收到了 / 语气是开心的 / 指标出来啦”三类幻觉
    // 原则：factualSummary 只取真实 result；relationshipInsight 不给“情绪画像”；
    //       suggestedAction 只在 capturedValue 真实存在时才说“指标”
    if (status === "confirmed" || status === "completed") {
      const elder = elders.find((e) => e.id === task.elderId);
      const elderName = task.elderDisplayName;
      const hasRealResult = Boolean(result && result.trim() && result.trim() !== "电话已确认" && result.trim() !== "电话回访确认已完成");

      // factualParts：仅“接通了电话” 或 “<长辈原话>” 二选一，不抷测
      const factualParts: string[] = [];
      if (hasRealResult) {
        factualParts.push(result!.trim());
      } else {
        factualParts.push(`${elderName}接通了电话`);
      }
      if (task.relayMessage) {
        factualParts.push(`你托我传的那句话（${task.relayMessage}），我转告给TA了`);
      }

      // relationshipInsight：只描述“接了电话”这个事实，不写死“语气是开心的”
      const relationshipInsight = hasRealResult
        ? `${elderName}跟念念说了几句~要看TA原话可以点上面的总结哈~`
        : `${elderName}这会儿接通了电话，但没说太多话~要是你想知道具体什么情况，可以再打一个~`;

      // suggestedAction：health_measurement + 真实有 capturedValue 才说“指标”，
      // 否则说中性话术，避免“指标出来啦”幻觉
      const looksLikeNumber = hasRealResult && /[\d.]/.test(result!);
      const suggestedAction = task.type === "health_measurement"
        ? (looksLikeNumber
            ? `${elderName}的指标是 ${result!.trim()}，你记一下~这两天要是有空跟TA聊聊~`
            : `${elderName}接了电话，但念念还没听清TA说做了没~你可以过会儿再问问~`)
        : task.type === "medication"
          ? `${elderName}接了电话，念念已经把这件事告诉他了~你这几天要是想问一眼，随时联系TA~`
          : `${elderName}接到了你的惦记~要是今晚有几分钟的话，给TA回个电话吧~`;

      const suggestedMessage = `听说你挺好的，我就放心啦~最近有点忙，但一直惦记着你呢~`;

      // Create insight
      const insight: CallInsight = {
        id: uid("insight"),
        taskId: task.id,
        elderId: task.elderId,
        elderDisplayName: elderName,
        factualSummary: factualParts.join("。"),
        relationshipInsight,
        suggestedAction,
        suggestedMessage,
        createdAt: nowLabel(),
      };
      setCallInsights((prev) => [insight, ...prev].slice(0, 20));

      // Send warm receipt to child
      const warmReceipt = `${elderName}刚刚接了电话啦~${factualParts.length > 0 ? `TA说：${factualParts.join("，")}。` : ""}${relationshipInsight} ${suggestedAction}`;

      addNotification({
        title: `${elderName}刚刚回复了`,
        detail: warmReceipt,
        level: "success",
      });

      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "summary",
        content: warmReceipt,
      });

      // Auto-extract memory entries (Step 4)
      const newMemories: MemoryEntry[] = [];
      if (result && result.length > 0) {
        newMemories.push({
          id: uid("mem"),
          category: "about_elder",
          content: `${elderName}最近回复：${result}`,
          source: `通话: ${task.title}`,
          importance: "medium",
          createdAt: nowLabel(),
        });
      }
      if (task.relayMessage) {
        newMemories.push({
          id: uid("mem"),
          category: "relationship",
          content: `你让念念给${elderName}带了句话：${task.relayMessage}`,
          source: `通话: ${task.title}`,
          importance: "medium",
          createdAt: nowLabel(),
        });
      }
      if (newMemories.length > 0) {
        setMemoryEntries((prev) => [...newMemories, ...prev]);
      }
    }

    if (status === "need_review") {
      addNotification({
        title: `${task.elderDisplayName}有一条回复待查看`,
        detail: "我还没完全听明白呢，要不你点开详情看一下呀~",
        level: "review",
      });
    }
    if (status === "timeout") {
      addNotification({
        title: `${task.elderDisplayName}暂时还没回应`,
        detail: "我已经试了两次啦~你可以稍后亲自联系一下哦。",
        level: "warning",
      });

      // Proactive suggestion (Step 5)
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `${task.elderDisplayName}两次都没接到电话呢，可能在忙吧~你要是方便的话，直接给TA打个电话会更好哦~`,
      });
    }
  }

  function sendNote(version: NoteVersion) {
    const elderName = currentElder?.displayName ?? "长辈";
    addNotification({
      title: `已把小纸条发给${elderName}`,
      detail: version.text,
      level: "info",
    });
    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `小纸条已经帮你准备好啦~内容是：${version.text}`,
    });
    appendElderMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: version.text,
    });
  }

  function openCall(task: Task | null, audience: UserMode) {
    setCallSession({
      open: true,
      audience,
      taskId: task?.id ?? null,
      elderId: currentElderId,  // 新增：锁定当前长辈身份
      sessionId: null,
      phase: "dialing",
      callHistory: [],
    });
  }

  function updateCallPhase(phase: CallSession["phase"]) {
    setCallSession((prev) => ({ ...prev, phase }));
    const task = tasks.find((item) => item.id === callSession.taskId) ?? latestElderTask;

    // 长辈端接通：调用对话 API 获取开场问候
    if (phase === "connected" && callSession.audience === "elder") {
      startElderCallConversation();
    }

    if (!task) return;

    if (phase === "connected") {
      applyTaskStatus(task, "reached");
    }

    if (phase === "missed") {
      applyTaskStatus(task, "timeout");
      appendElderMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `${task.elderDisplayName}，我刚刚给你打电话没接通，没关系。你方便时回我一句，我再帮你把话带给孩子。`,
      });
    }
  }

  /** 启动长辈端对话：调用 API 获取开场问候并播放 */
  async function startElderCallConversation() {
    setCallSession((prev) => ({ ...prev, phase: "loading" }));

    if (!callSession.elderId) {
      // 没有 elderId，无法启动对话
      setCallSession((prev) => ({ ...prev, phase: "ended" }));
      return;
    }

    try {
      // start 只传 ID，服务端查库锁定上下文
      const res = await fetch("/api/elder-call-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          elderId: callSession.elderId,
          taskOccurrenceId: callSession.taskId,  // 可选
          caregiverId: "user_xiaoyu",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "对话启动失败");

      const reply = data.reply?.trim() || `您好呀~我是小雨设置的小助理念念，小雨让我来跟您聊几句~`;
      const history = [{ role: "assistant" as const, text: reply }];

      setCallSession((prev) => ({
        ...prev,
        sessionId: data.sessionId,  // 新增：保存 sessionId
        phase: "speaking",
        callHistory: history,
        currentSpeakText: reply,
        currentStage: data.stage ?? "greeting",
        elderResponses: [],
      }));

      setTimeout(() => playElderTurn(reply, data.shouldEndCall ?? false), 400);
    } catch {
      // 降级：用预设开场白
      const elderName = currentElder?.displayName ?? "您";
      const fallback = `您好呀~我是小雨设置的小助理念念，小雨让我来跟您聊几句，您现在方便吗？`;
      const history = [{ role: "assistant" as const, text: fallback }];
      setCallSession((prev) => ({
        ...prev,
        phase: "speaking",
        callHistory: history,
        currentSpeakText: fallback,
        currentStage: "greeting",
        elderResponses: [],
      }));
      setTimeout(() => playElderTurn(fallback, false), 400);
    }
  }

  /** 播放长辈端某一段 TTS 语音（T0 修复：强制服务端 TTS） */
  function playElderTurn(text: string, isCallEnding: boolean) {
    elderTTS.stop();
    elderTTS.speak({
      text,
      rate: 0.9,
      pitch: 1.05,
      volume: 0.85,
      forceServer: true,
      onProviderDetected: (ttsProvider) => {
        console.log("[elder_call_turn]", {
          phase: "tts",
          elderInput: callSession.callHistory?.[callSession.callHistory.length - 1]?.text ?? "",
          assistantReply: text,
          ttsProvider,
          isCallEnding,
        });
      },
      onEnd: () => {
        if (isCallEnding) {
          // 通话应该结束
          setTimeout(() => {
            setCallSession((p) => ({ ...p, phase: "ended" }));
          }, 800);
        } else {
          // 进入聆听状态，等待长辈回应
          setCallSession((prev) => ({ ...prev, phase: "listening" }));
        }
      },
      onError: (err) => {
        // T0 修复：服务端 TTS 不可用时 console 报错，不静默 fallback
        console.error("[elder_call_turn] TTS 失败：", err);
      },
    });
  }

  /** 处理长辈的回应：调用对话 API 获取下一轮回复 */
  async function handleElderResponse(responseText: string) {
    // 记录长辈回应
    const responses = [...(callSession.elderResponses ?? []), responseText];
    const elderEntry = { role: "elder" as const, text: responseText };
    const history = [...callSession.callHistory, elderEntry];

    setCallSession((prev) => ({
      ...prev,
      phase: "loading",
      elderResponses: responses,
      callHistory: history,
    }));

    try {
      // 使用 continue action，传 sessionId，服务端从 session 加载上下文
      const res = await fetch("/api/elder-call-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "continue",
          sessionId: callSession.sessionId,
          elderInput: responseText,
        }),
      });

      // session 过期，重新创建
      if (res.status === 410) {
        // T0 修复：不抦断通话、不说"不打扰您"。重启一个新 session、复用同样的问候语，让长辈感觉到通话没断
        const elderName = currentElder?.displayName ?? "妈";
        const restartFallback = `抱歉${elderName}刚才信号不太好，念念再连一下哈~`;
        try {
          const restartRes = await fetch("/api/elder-call-conversation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "start",
              elderId: callSession.elderId,
              taskOccurrenceId: callSession.taskId,
              caregiverId: "user_xiaoyu",
            }),
          });
          const restartData = await restartRes.json();
          if (restartRes.ok) {
            const newReply = restartData.reply?.trim() || restartFallback;
            const newHistory = [...history, { role: "assistant" as const, text: newReply }];
            setCallSession((prev) => ({
              ...prev,
              sessionId: restartData.sessionId,
              phase: "speaking",
              callHistory: newHistory,
              currentSpeakText: newReply,
              currentStage: restartData.stage ?? "greeting",
              elderResponses: [],
            }));
            setTimeout(() => playElderTurn(newReply, false), 300);
            return;
          }
        } catch {
          // restart 也失败了 → 降级到温和兑底，不挂断
        }
        const newHistory = [...history, { role: "assistant" as const, text: restartFallback }];
        setCallSession((prev) => ({
          ...prev,
          phase: "speaking",
          callHistory: newHistory,
          currentSpeakText: restartFallback,
          currentStage: "warm_chat",
        }));
        setTimeout(() => playElderTurn(restartFallback, false), 300);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "回复失败");

      const reply = data.reply?.trim() || "嗯嗯，我都记下来啦~";
      const newHistory = [...history, { role: "assistant" as const, text: reply }];

      // 根据服务端返回的 capturedTaskStatus 更新任务状态
      // T0 修复：not_done / postponed 不能再标为 "confirmed"（那会写入"知道了收到了"幻觉 + "语气是开心的"）
      // 这两个状态需要子女亲自确认，先标 need_review 让子女决定
      const task = tasks.find((item) => item.id === callSession.taskId) ?? latestElderTask;
      if (task && data.capturedTaskStatus) {
        const status = data.capturedTaskStatus.status;
        if (status === "done") {
          applyTaskStatus(task, "completed", responseText);
        } else if (status === "not_done") {
          applyTaskStatus(task, "not_done", responseText);
        } else if (status === "postponed") {
          applyTaskStatus(task, "postponed", responseText);
        } else if (status === "needs_help") {
          applyTaskStatus(task, "need_review", responseText);
        }
      }

      // P0-3: 通话结束/有结果时，编译一份子女端可读回执推到聊天区
      if (data.shouldEndCall && userMode === "child") {
        const captured = data.capturedTaskStatus;
        const intent = data.intent as string | undefined;
        const elderDisplayName = currentElder?.displayName ?? "长辈";
        const lines: string[] = [];
        lines.push(`📞 和${elderDisplayName}的提醒电话结束了~`);

        // 1) 事实摘要：用 captured 的 note 作为原始依据
        if (captured?.note) {
          lines.push(`${elderDisplayName}说：${captured.note}`);
        }
        // 2) 健康异常 → 升级提示
        if (data.healthAlert || captured?.status === "health_abnormal") {
          lines.push(`⚠️ TA提了健康相关情况，建议你尽快联系一下。`);
        }
        // 3) 任务状态
        if (captured?.status === "done") {
          lines.push(`✅ 任务算完成了。`);
        } else if (captured?.status === "not_done") {
          lines.push(`⏳ 这次还没做。`);
        } else if (captured?.status === "postponed") {
          lines.push(`🕐 延后了。`);
        } else if (captured?.status === "needs_help") {
          lines.push(`❓ 需要帮助（${captured.issue ?? "看上下文"}）。`);
        }
        // 4) 留言转达
        if (data.relayMessage) {
          lines.push(`💬 ${elderDisplayName}想跟你说：${data.relayMessage}`);
        }
        // 5) 拟建议（给子女的）
        if (captured?.status === "done") {
          lines.push(`👉 你可以在合适的时候问候一下，或者把这次结果分享给家人。`);
        } else if (captured?.status === "not_done" || captured?.status === "postponed") {
          lines.push(`👉 下次再提醒一下，或者你亲自问问。`);
        }
        appendAssistantMessage({
          id: uid("msg"),
          role: "assistant",
          kind: "summary",
          content: lines.join("\n"),
        });
      }

      setCallSession((prev) => ({
        ...prev,
        phase: "speaking",
        callHistory: newHistory,
        currentSpeakText: reply,
        currentStage: data.stage ?? "warm_chat",
      }));

      setTimeout(() => playElderTurn(reply, data.shouldEndCall ?? false), 300);
    } catch {
      // 降级：简单回应（T0 修复：不抦断通话、不说"不打扰您"，温和继续）
      const elderName = currentElder?.displayName ?? "妈";
      const fallback = `嗯嗯${elderName}，我记下来啦~${elderName}继续跟我说呗~`;
      const newHistory = [...history, { role: "assistant" as const, text: fallback }];
      setCallSession((prev) => ({
        ...prev,
        phase: "speaking",
        callHistory: newHistory,
        currentSpeakText: fallback,
        currentStage: "warm_chat",
      }));
      setTimeout(() => playElderTurn(fallback, false), 300);
    }
  }

  /** 跳过当前等待，用默认回应推进对话 */
  function skipToNextTurn() {
    handleElderResponse("好的，知道了");
  }

  function closeCall() {
    elderTTS.stop();
    setCallSession((prev) => ({
      ...prev,
      open: false,
      phase: "ended",
      callHistory: [],
      currentSpeakText: "",
      currentStage: "",
      elderResponses: [],
      sessionId: null,  // 清空 sessionId
    }));
  }

  // ─── 独立 Voice Call 系统已删除（2025-01）─────────────────────────────
  // 原因：startAgentCall/sendAgentTurn/finalizeAgentCall 走的是 call-orchestrator，
  // 与 elder-call-conversation 是两套互不相通的系统，导致「奶奶/妈妈」称呼错乱。
  // 统一保留 elder-call-conversation（openCall + callSession）作为唯一通话入口。

  async function triggerSchedulerTick() {
    setSchedulerResult("正在触发调度器...");
    try {
      const res = await fetch("/api/scheduler/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      const triggered = data.triggered ?? [];
      const skipped = data.skipped ?? [];
      const lines: string[] = [];
      if (triggered.length > 0) {
        lines.push(`✅ 触发 ${triggered.length} 个通话:`);
        triggered.forEach((t: { elderDisplayName: string; callSessionId: string }) => {
          lines.push(`  - ${t.elderDisplayName} (session: ${t.callSessionId})`);
        });
      }
      if (skipped.length > 0) {
        lines.push(`⏭️ 跳过 ${skipped.length} 个:`);
        skipped.forEach((s: { templateId: string; reason: string }) => {
          lines.push(`  - ${s.templateId}: ${s.reason}`);
        });
      }
      if (lines.length === 0) lines.push("没有触发任何任务。");
      setSchedulerResult(lines.join("\n"));
    } catch (err) {
      setSchedulerResult(`调度失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  }

  async function handleElderSubmit(text = elderInput) {
    const trimmed = text.trim();
    if (!trimmed || isElderReplying) return;

    appendElderMessage({
      id: uid("msg"),
      role: "user",
      kind: "text",
      content: trimmed,
    });
    setElderInput("");

    // Task status detection (retained for task management, independent of reply)
    if (latestElderTask) {
      if (trimmed.includes("做完") || trimmed.includes("好了") || trimmed.includes("挺好的")) {
        applyTaskStatus(latestElderTask, "completed", trimmed);
      } else if (trimmed.includes("知道") || trimmed.includes("收到")) {
        applyTaskStatus(latestElderTask, "confirmed", trimmed);
      } else {
        applyTaskStatus(latestElderTask, "need_review", trimmed);
      }
    }

    // 构建 LLM 上下文
    const elderCtx = currentElder
      ? {
          displayName: currentElder.displayName,
          relation: currentElder.relation,
          healthFocus: currentElder.healthFocus ?? [],
          communicationPreference: currentElder.communicationPreference ?? [],
          responseHabit: currentElder.responseHabit ?? "",
        }
      : undefined;

    // 取最近对话历史（最多 8 轮）
    const history = elderMessages.slice(-8).map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    setIsElderReplying(true);

    try {
      const res = await fetch("/api/elder-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          elder: elderCtx,
          history,
          caregiverName: "小雨",
          elderId: currentElderId ?? undefined,    // P3-8: 共享上下文
          caregiverId: "user_xiaoyu",              // P3-8: 共享上下文
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "回复失败");

      const reply = data.reply?.trim() || "我收到啦，你有什么想跟孩子说的，我可以帮你带到。";

      appendElderMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: reply,
      });
    } catch {
      // 降级：LLM 失败时用简洁的 fallback
      appendElderMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: "我收到啦，你要是还有什么想说的，随时告诉我。",
      });
    } finally {
      setIsElderReplying(false);
    }
  }

  function runLocalAgentFlow(trimmed: string) {
    const intent = inferIntent(trimmed);

    if (intent === "add_elder") {
      const hintedRelation = RELATION_OPTIONS.find((relation) => trimmed.includes(relation)) ?? "妈妈";
      resetForm(hintedRelation);
      setShowAddElder(true);
      setActiveTab("profile");
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `没问题呀~我已经把"添加长辈"的表单打开啦。你补一下${hintedRelation}的联系方式，我就能开始帮你记挂TA啦~`,
      });
      return;
    }

    if (intent === "rewrite_note") {
      const target = detectTargetElders(trimmed, elders, currentElder)[0];
      if (!target) {
        appendAssistantMessage({
          id: uid("msg"),
          role: "assistant",
          kind: "text",
          content: "这句话我可以帮你改得更柔和呀~你想发给哪位长辈呢？",
        });
        return;
      }
      const noteVersions = buildNoteVersions(trimmed, target.displayName);
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "note",
        content: "这句话有点着急了呢，我帮你换个更温柔的说法吧~",
        noteVersions,
      });
      return;
    }

    if (intent === "query_status") {
      const target = detectTargetElders(trimmed, elders, currentElder)[0] ?? currentElder;
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "summary",
        content: summarizeTasks(tasks, target),
      });
      return;
    }

    if (intent === "create_task") {
      startTaskCreation(trimmed);
      return;
    }

    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: "我现在最擅长 3 件事呢：创建提醒、查回执、把话改得更温柔~你直接对我说一句完整的话试试嘛~",
    });
  }

  // ─── Multi-step Task Creation Flow ──────────────────────────────────
  function startTaskCreation(text: string) {
    const targets = detectTargetElders(text, elders, currentElder);
    const remindLabel = parseRemindLabel(text);
    const taskType = inferTaskType(text);
    const repeatRule = text.includes("每天") ? "daily" : "none";

    // No target elder
    if (targets.length === 0) {
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: "你想提醒哪位长辈呀？跟我说一下称呼就好啦~",
      });
      return;
    }

    // Time is missing - enter the flow asking for time
    if (!remindLabel) {
      const slots = recommendTimeSlots(targets[0]);
      setTaskCreateFlow({
        step: "awaiting_time",
        rawText: text,
        targets,
        taskType,
        remindLabel: "",
        repeatRule,
        relayMessage: "",
        recommendedSlots: slots,
      });
      const slotHint = slots.length > 0
        ? `${targets[0].displayName}之前${targets[0].availableTime}比较方便。${slots[0]} 这个时间可以吗？`
        : "每天几点打比较合适？";
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `好呀，我先帮你整理一下~这是一个${repeatRule === "daily" ? "每日" : ""}电话提醒。${slotHint}`,
      });
      return;
    }

    // Time is present - go directly to relay question
    setTaskCreateFlow({
      step: "awaiting_relay",
      rawText: text,
      targets,
      taskType,
      remindLabel,
      repeatRule,
      relayMessage: "",
      recommendedSlots: [],
    });
    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `好呀~${remindLabel}给${targets[0].displayName}打电话。要不要顺便帮你带句话呢？比如告诉TA你最近有点忙，但一直惦记着TA哦~`,
    });
  }

  function handleTimeResponse(text: string) {
    const flow = taskCreateFlow;
    if (flow.targets.length === 0) {
      setTaskCreateFlow((prev) => ({ ...prev, step: "idle" }));
      return;
    }

    // Try to parse time from user response
    let parsedTime = parseRemindLabel(text);
    if (!parsedTime) {
      // Check if user picked a recommended slot
      const matchedSlot = flow.recommendedSlots.find((slot) =>
        normalizeText(text).includes(normalizeText(slot).replace(/\s/g, "")),
      );
      if (matchedSlot) {
        parsedTime = matchedSlot;
      }
    }

    if (!parsedTime) {
      // User didn't provide a clear time, check for affirmative ("可以", "行")
      if (normalizeText(text).includes("可以") || normalizeText(text).includes("行") || normalizeText(text).includes("好")) {
        parsedTime = flow.recommendedSlots[0] ?? "晚饭后 20:00";
      }
    }

    if (!parsedTime) {
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: "没太听明白时间呢~你直接说个大概就行呀，比如：晚饭后8点、早上9点~",
      });
      return;
    }

    // Move to relay question
    setTaskCreateFlow({
      ...flow,
      step: "awaiting_relay",
      remindLabel: parsedTime,
    });

    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `好呀~${parsedTime}给${flow.targets[0].displayName}打电话。要不要顺便帮你带句话呢？比如告诉TA你最近有点忙，但一直惦记着TA哦~`,
    });
  }

  function handleRelayResponse(text: string) {
    const flow = taskCreateFlow;
    if (flow.targets.length === 0) {
      setTaskCreateFlow((prev) => ({ ...prev, step: "idle" }));
      return;
    }

    const normalized = normalizeText(text);
    let relayMessage = "";

    // Check if user declined
    if (normalized.includes("不用") || normalized.includes("算了") || normalized.includes("没有") || normalized.includes("不用了")) {
      relayMessage = "";
    } else if (normalized.includes("可以") && normalized.length <= 4) {
      // Just said "可以" without specifying - skip
      relayMessage = "";
    } else if (normalized.includes("就说") || normalized.includes("告诉她") || normalized.includes("告诉他") || normalized.length > 5) {
      relayMessage = formatRelayForDraft(text, flow.targets[0].displayName);
    }

    // Generate the confirmation draft
    const target = flow.targets[0];
    const needResult = flow.taskType === "health_measurement" || flow.rawText.includes("告诉我") || flow.rawText.includes("数值");
    const titleMap: Record<TaskType, string> = {
      medication: `提醒${target.displayName}吃药`,
      health_measurement: `提醒${target.displayName}测量`,
      bring_items: `提醒${target.displayName}带好物品`,
      call_back: `提醒${target.displayName}回电`,
      other: `提醒${target.displayName}留意事项`,
    };

    const drafts: TaskDraft[] = flow.targets.map((elder) => ({
      id: uid("draft"),
      title: titleMap[flow.taskType],
      type: flow.taskType,
      elderId: elder.id,
      elderDisplayName: elder.displayName,
      content: buildTaskContent(flow.rawText, flow.taskType, elder.displayName),
      remindLabel: flow.remindLabel,
      repeatRule: flow.repeatRule,
      channel: "电话提醒",
      needConfirmation: true,
      needResult,
      priority: "normal",
      created: false,
      relayMessage,
    }));

    setTaskCreateFlow((prev) => ({ ...prev, step: "idle" }));

    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "taskDraft",
      content: "帮你整理好啦~确认一下就可以咯~",
      drafts,
    });
  }

  function triggerQuickAction(action: "remind" | "note" | "status") {
    const elderName = currentElder?.displayName ?? currentElder?.relation ?? "长辈";
    const prompts = {
      remind: `帮我给${elderName}发个提醒`,
      note: `帮我给${elderName}写个小纸条`,
      status: `看看${elderName}现在的状态`,
    } as const;

    void handleAgentSubmit(prompts[action]);
  }

  function applyAgentResponse(result: AgentServerResponse) {
    if (result.openProfile) {
      resetForm(result.relationHint && RELATION_OPTIONS.includes(result.relationHint) ? result.relationHint : "妈妈");
      setShowAddElder(true);
      setActiveTab("profile");
    }

    if (result.kind === "taskDraft" && result.drafts && result.drafts.length > 0) {
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "taskDraft",
        content: result.content,
        drafts: result.drafts.map((draft) => ({
          ...draft,
          id: uid("draft"),
          created: false,
        })),
      });
      return;
    }

    if (result.kind === "note" && result.noteVersions && result.noteVersions.length > 0) {
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "note",
        content: result.content,
        noteVersions: result.noteVersions,
      });
      return;
    }

    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: result.kind === "summary" ? "summary" : "text",
      content: result.content,
    });
  }

  async function handleAgentSubmit(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    // If in a task creation flow, handle the response locally
    if (taskCreateFlow.step === "awaiting_time") {
      const userMessage: Message = {
        id: uid("msg"),
        role: "user",
        kind: "text",
        content: trimmed,
      };
      setMessages((prev) => [...prev, stampMessage(userMessage)]);
      setInput("");
      setIsSubmitting(true);
      try {
        handleTimeResponse(trimmed);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (taskCreateFlow.step === "awaiting_relay") {
      const userMessage: Message = {
        id: uid("msg"),
        role: "user",
        kind: "text",
        content: trimmed,
      };
      setMessages((prev) => [...prev, stampMessage(userMessage)]);
      setInput("");
      setIsSubmitting(true);
      try {
        handleRelayResponse(trimmed);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const userMessage: Message = {
      id: uid("msg"),
      role: "user",
      kind: "text",
      content: trimmed,
    };
    setMessages((prev) => [...prev, stampMessage(userMessage)]);
    setInput("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: trimmed,
          currentElderId,
          assistantProfile,
          recentMemories: assistantMemories.slice(-7).map((memory) => ({
            dateLabel: memory.dateLabel,
            summary: memory.summary,
            childTranscript: memory.childTranscript,
            elderTranscript: memory.elderTranscript,
          })),
          elders: elders.map((elder) => ({
            id: elder.id,
            relation: elder.relation,
            displayName: elder.displayName,
            availableTime: elder.availableTime,
            communicationPreference: elder.communicationPreference,
            nicknames: elder.nicknames,
          })),
          tasks: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            elderId: task.elderId,
            elderDisplayName: task.elderDisplayName,
            remindLabel: task.remindLabel,
            status: task.status,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("agent-api-failed");
      }

      const result = (await response.json()) as AgentServerResponse;
      applyAgentResponse(result);
    } catch {
      runLocalAgentFlow(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!hydrated) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-stone-500">正在准备 Demo...</main>;
  }

  if (!userMode) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <div className="rounded-[28px] border border-orange-100 bg-white p-6 shadow-[0_20px_60px_rgba(242,153,110,0.15)]">
          {/* 第一阶段：输入手机号 */}
          {loginStep === "phone" && (
            <>
              <div className="mb-6">
                <p className="text-sm font-medium text-orange-500">突然有点惦记你们</p>
                <h1 className="mt-2 text-2xl font-semibold text-stone-800">手机号登录</h1>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  输入你的手机号即可登录，登录后可在「我的」里绑定家人，绑定成功就能端对端连接。
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-400">手机号</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="请输入手机号"
                    className="min-h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base text-stone-800 outline-none transition-colors focus:border-[#F2996E] focus:bg-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={loginPhone.length < 11}
                  onClick={() => setLoginStep("info")}
                  className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-base font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一步
                </button>
              </div>
            </>
          )}

          {/* 第二阶段：填写信息 + 选角色 */}
          {loginStep === "info" && (
            <>
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setLoginStep("phone")}
                  className="text-xs text-stone-400"
                >
                  ← 返回
                </button>
                <h1 className="mt-2 text-xl font-semibold text-stone-800">完善信息</h1>
                <p className="mt-1 text-xs text-stone-400">你的身份ID将自动生成，登录后可在「我的」里查看和绑定家人。</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-400">你的称呼</label>
                  <input
                    type="text"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    placeholder="如：小雨 / 妈妈"
                    maxLength={10}
                    className="min-h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base text-stone-800 outline-none transition-colors focus:border-[#F2996E] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-stone-400">选择身份</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setLoginRole("child")}
                      className={`min-h-14 rounded-2xl px-4 py-3 text-base font-medium transition-all ${
                        loginRole === "child"
                          ? "bg-[#F2996E] text-white shadow-md"
                          : "bg-stone-50 text-stone-500"
                      }`}
                    >
                      我是子女
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginRole("elder")}
                      className={`min-h-14 rounded-2xl px-4 py-3 text-base font-medium transition-all ${
                        loginRole === "elder"
                          ? "bg-[#F2996E] text-white shadow-md"
                          : "bg-stone-50 text-stone-500"
                      }`}
                    >
                      我是长辈
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl bg-orange-50 px-4 py-3">
                  <p className="text-xs text-stone-400">你的身份ID</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#F2996E]">{generateUserId(loginPhone)}</p>
                </div>
                <button
                  type="button"
                  disabled={!loginName.trim()}
                  onClick={loginWithPhone}
                  className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-base font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  登录
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  if (elders.length === 0 && userMode === "elder") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <div className="rounded-[28px] border border-orange-100 bg-white p-6 shadow-[0_20px_60px_rgba(242,153,110,0.15)]">
          <p className="text-sm font-medium text-orange-500">小助理</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-800">还没有绑定长辈档案</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            先让子女端添加一位长辈，或者直接导入演示数据，我就能开始通过电话提醒、消息提醒和聊天反馈陪着跟进。
          </p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={loadDemoData}
              className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-sm font-medium text-white"
            >
              导入演示数据
            </button>
            <button
              type="button"
              onClick={clearIdentity}
              className="min-h-12 w-full rounded-2xl bg-[#FFF1C7] px-4 py-3 text-sm font-medium text-stone-700"
            >
              重选身份
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (elders.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <div className="rounded-[28px] border border-orange-100 bg-white p-6 shadow-[0_20px_60px_rgba(242,153,110,0.15)]">
          <div className="mb-6">
            <p className="text-sm font-medium text-orange-500">突然有点惦记你们</p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-800">先添加一位你惦记的人</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              我会帮你把一句惦记，变成提醒、回执和更温柔的话。
            </p>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-stone-600">
              TA 是你的？
              <select
                value={elderForm.relation}
                onChange={(event) => setElderForm((prev) => ({ ...prev, relation: event.target.value }))}
                className="mt-2 min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
              >
                {RELATION_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-stone-600">
              你平时怎么称呼 TA？
              <input
                value={elderForm.displayName}
                onChange={(event) => setElderForm((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="妈 / 爸 / 奶奶 / 王叔"
                className="mt-2 min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
              />
            </label>

            <label className="block text-sm text-stone-600">
              TA 的手机号？
              <input
                value={elderForm.phone}
                onChange={(event) => setElderForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="138xxxxxxx"
                className="mt-2 min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
              />
            </label>

            <label className="block text-sm text-stone-600">
              平时什么时候方便接电话？
              <input
                value={elderForm.availableTime}
                onChange={(event) => setElderForm((prev) => ({ ...prev, availableTime: event.target.value }))}
                className="mt-2 min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
              />
            </label>
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={createElder}
              className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-sm font-medium text-white"
            >
              生成这位长辈的惦记助手
            </button>
            <button
              type="button"
              onClick={loadDemoData}
              className="min-h-12 w-full rounded-2xl bg-[#FFF1C7] px-4 py-3 text-sm font-medium text-stone-700"
            >
              一键导入演示数据
            </button>
          </div>
        </div>
      </main>
    );
  }

  const navActiveTab: "home" | "tasks" | "assistant" | "notifications" =
    activeTab === "profile" ? "home" : activeTab;

  if (userMode === "elder") {
    return (
      <main className="mx-auto flex h-[100svh] max-w-md flex-col overflow-hidden text-stone-800">
        {callSession.open && (
          <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#2a1a0f] via-[#1a1010] to-[#0d0808] text-white">
            {/* Ambient orbs */}
            <div className="pointer-events-none absolute left-[-10%] top-[15%] h-72 w-72 rounded-full bg-[#F2996E]/15 blur-[100px]" />
            <div className="pointer-events-none absolute bottom-[25%] right-[-5%] h-64 w-64 rounded-full bg-rose-500/10 blur-[90px]" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between px-6 pt-[max(20px,env(safe-area-inset-top))]">
              <p className="text-[12px] text-white/40">
                {callSession.phase === "dialing" && "来电中"}
                {(callSession.phase === "connected" || callSession.phase === "speaking" || callSession.phase === "loading") && "通话中"}
                {callSession.phase === "listening" && "通话中"}
                {callSession.phase === "missed" && "未接通"}
                {callSession.phase === "ended" && "通话结束"}
              </p>
              {callSession.callHistory.length > 0 && callSession.phase !== "dialing" && callSession.phase !== "ended" && callSession.phase !== "missed" && (
                <p className="text-[11px] text-white/30">
                  第{Math.ceil(callSession.callHistory.length / 2) + 1}轮
                </p>
              )}
            </div>

            {/* Center area */}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
              {/* Avatar with breathing rings */}
              <div className="relative flex items-center justify-center">
                {(callSession.phase === "dialing" || callSession.phase === "speaking" || callSession.phase === "connected" || callSession.phase === "loading") && (
                  <>
                    <span className="absolute h-32 w-32 rounded-full bg-[#F2996E]/20" style={{ animation: "breathe 2s ease-out infinite" }} />
                    <span className="absolute h-28 w-28 rounded-full bg-[#F2996E]/15" style={{ animation: "breathe 2s ease-out 0.3s infinite" }} />
                  </>
                )}
                {callSession.phase === "listening" && (
                  <>
                    <span className="absolute h-32 w-32 rounded-full bg-emerald-400/15" style={{ animation: "breathe 2.5s ease-out infinite" }} />
                    <span className="absolute h-28 w-28 rounded-full bg-emerald-400/10" style={{ animation: "breathe 2.5s ease-out 0.3s infinite" }} />
                  </>
                )}
                <img src="/assistant-avatar.jpg" alt="小助理" className="relative h-24 w-24 rounded-full object-cover shadow-[0_8px_32px_rgba(242,153,110,0.3)]" />
              </div>

              <p className="mt-5 text-[22px] font-semibold tracking-tight">小助理：念念</p>
              <p className="mt-1.5 text-[13px] text-white/50">
                {callSession.phase === "dialing" && "正在问候..."}
                {callSession.phase === "speaking" && "念念说话中..."}
                {callSession.phase === "loading" && "念念思考中..."}
                {callSession.phase === "connected" && "通话中"}
                {callSession.phase === "listening" && "轮到您说啦~"}
                {callSession.phase === "missed" && "暂时没人接"}
                {callSession.phase === "ended" && "通话结束"}
              </p>

              {/* Waveform - AI speaking */}
              {(callSession.phase === "speaking" || callSession.phase === "dialing") && (
                <div className="mt-5 flex h-8 items-center justify-center gap-1">
                  {[0.4, 0.7, 0.3, 0.9, 0.5, 0.8, 0.35, 0.6].map((ratio, i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-[#F2996E]/70"
                      style={{
                        height: `${ratio * 32}px`,
                        animation: `waveform ${0.5 + i * 0.08}s ease-in-out infinite alternate`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Listening indicator - green waveform */}
              {callSession.phase === "listening" && (
                <div className="mt-5 flex h-8 items-center justify-center gap-1">
                  {[0.3, 0.6, 0.4, 0.7, 0.5, 0.6, 0.4, 0.5].map((ratio, i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-emerald-400/50"
                      style={{
                        height: `${ratio * 28}px`,
                        animation: elderTTS.speaking ? "none" : `waveform 0.6s ease-in-out ${i * 0.08}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Current turn subtitle - glassmorphism card */}
              {(callSession.phase === "speaking" || callSession.phase === "loading") && callSession.currentSpeakText && (
                <div className="mt-5 w-full max-w-xs">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
                    <p className="text-[14px] leading-6 text-white/90">
                      {callSession.currentSpeakText}
                    </p>
                  </div>
                </div>
              )}

              {/* Listening subtitle + text input */}
              {callSession.phase === "listening" && (
                <div className="mt-5 w-full max-w-xs">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
                    <p className="mb-3 text-center text-[13px] text-white/50">
                      轮到您说啦~
                    </p>
                    {/* Free text input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={callInput}
                        onChange={(e) => setCallInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && callInput.trim()) {
                            const text = callInput.trim();
                            setCallInput("");
                            handleElderResponse(text);
                          }
                        }}
                        placeholder="输入您想说的话..."
                        autoFocus
                        className="min-h-11 flex-1 rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-[14px] text-white/90 placeholder:text-white/30 outline-none backdrop-blur-md focus:border-white/30"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (callInput.trim()) {
                            const text = callInput.trim();
                            setCallInput("");
                            handleElderResponse(text);
                          }
                        }}
                        disabled={!callInput.trim()}
                        className="flex min-h-11 items-center justify-center rounded-xl bg-[#F2996E] px-4 text-[14px] font-medium text-white disabled:opacity-30"
                      >
                        发送
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Ended state - show conversation summary */}
              {callSession.phase === "ended" && (
                <div className="mt-5 w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
                  <p className="mb-2 text-center text-[12px] text-[#F2996E]/60">通话结束啦</p>
                  {(callSession.elderResponses ?? []).length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-white/40">您说的：</p>
                      {callSession.elderResponses?.map((r, i) => (
                        <p key={i} className="text-[13px] text-emerald-300/80">· {r}</p>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[12px] text-white/40">念念会把情况告诉小雨的~</p>
                </div>
              )}

              {callSession.phase === "missed" && (
                <div className="mt-5 w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center backdrop-blur-md">
                  <p className="text-[14px] text-white/50">暂时没人接听，稍后再试</p>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="relative z-10 px-8 pb-[max(28px,env(safe-area-inset-bottom))] pt-4">
              {/* Dialing - accept / decline */}
              {callSession.phase === "dialing" && (
                <div className="flex items-center justify-center gap-16">
                  <button
                    type="button"
                    onClick={() => updateCallPhase("missed")}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white rotate-[135deg]">
                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-white/40">拒接</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCallPhase("connected")}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-white/40">接听</span>
                  </button>
                </div>
              )}

              {/* Loading - just hang up */}
              {callSession.phase === "loading" && (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={closeCall}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white rotate-[135deg]">
                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">挂断</span>
                  </button>
                </div>
              )}

              {/* Speaking - replay button + hang up */}
              {callSession.phase === "speaking" && (
                <div className="flex items-center justify-center gap-8">
                  <button
                    type="button"
                    onClick={() => {
                      const text = callSession.currentSpeakText ?? "";
                      if (text) {
                        elderTTS.stop();
                        const ending = callSession.currentStage === "closing";
                        setTimeout(() => playElderTurn(text, ending), 200);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                        <path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1.06-6.7 2.82L3 8" />
                        <path d="M3 4v4h4" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">重播</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeCall}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white rotate-[135deg]">
                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">挂断</span>
                  </button>
                </div>
              )}

              {/* Listening - response action buttons */}
              {callSession.phase === "listening" && (
                <div className="flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={() => {
                      const text = callSession.currentSpeakText ?? "";
                      if (text) {
                        elderTTS.stop();
                        const ending = callSession.currentStage === "closing";
                        setTimeout(() => playElderTurn(text, ending), 200);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                        <path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1.06-6.7 2.82L3 8" />
                        <path d="M3 4v4h4" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">重播</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleElderResponse("好的，知道了")}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                        <path d="M9 12l2 2 4-4" />
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">知道了</span>
                  </button>
                  <button
                    type="button"
                    onClick={skipToNextTurn}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/70">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">跳过</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeCall}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white rotate-[135deg]">
                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                      </svg>
                    </div>
                    <span className="text-[10px] text-white/40">挂断</span>
                  </button>
                </div>
              )}

              {/* Ended - close button */}
              {callSession.phase === "ended" && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentCallTask) applyTaskStatus(currentCallTask, "confirmed", "通话完成");
                      closeCall();
                    }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/70">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-white/40">关闭</span>
                  </button>
                </div>
              )}

              {/* Missed - close */}
              {callSession.phase === "missed" && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={closeCall}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/60">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="text-[11px] text-white/40">关闭</span>
                  </button>
                </div>
              )}
            </div>

            <style jsx>{`
              @keyframes breathe {
                0% { transform: scale(1); opacity: 0.5; }
                100% { transform: scale(1.5); opacity: 0; }
              }
              @keyframes pulse {
                0% { transform: scaleY(0.3); }
                100% { transform: scaleY(1); }
              }
              @keyframes waveform {
                0% { transform: scaleY(0.3); }
                100% { transform: scaleY(1); }
              }
            `}</style>
          </div>
        )}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Clean header - WeChat style */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <img src="/assistant-avatar.jpg" alt="小助理" className="h-8 w-8 rounded-full object-cover" />
              <div>
                <p className="text-[15px] font-semibold leading-tight text-stone-800">小助理：念念</p>
                <p className="mt-0.5 text-[11px] leading-tight text-stone-400">
                  {currentElder ? `${currentElder.displayName}，你好` : ""} · 小助理在线
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIdentityCardOpen(true);
                refreshAccountInfo();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF1C7] text-sm font-medium text-stone-700 shadow-sm transition-transform hover:scale-105"
              aria-label="我的身份"
              title={identity?.displayName ?? currentElder?.displayName ?? "我的身份"}
            >
              {(identity?.displayName ?? currentElder?.displayName ?? "长").slice(0, 1)}
            </button>
          </div>

          {/* Message list - WeChat style bubbles */}
          <div ref={elderChatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-3">
              {elderMessages.map((message, idx) => {
                const isLastAssistant = message.role === "assistant" && !isElderReplying && !elderMessages.slice(idx + 1).some(m => m.role === "assistant");
                return (
                  <div key={message.id}>
                    <div className={`flex items-start gap-2 ${message.role === "user" ? "justify-end" : ""}`} {...(message.role === "assistant" ? { "data-assistant-message": "true" } : {})}>
                      {message.role === "assistant" && (
                        <img src="/assistant-avatar.jpg" alt="小助理" className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover" />
                      )}
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 ${
                        message.role === "user"
                          ? "rounded-tr-md bg-[#F2996E] text-white"
                          : "rounded-tl-md bg-white text-stone-700"
                      }`}>
                        <p>{message.content}</p>
                      </div>
                    </div>
                    {isLastAssistant && (
                      <div className="ml-11 mt-2 flex flex-wrap gap-1.5">
                        {ELDER_QUICK_INPUTS.map((sample) => (
                          <button
                            key={sample}
                            type="button"
                            onClick={() => setElderInput(sample)}
                            className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] text-orange-600/80 transition-colors active:bg-orange-100"
                          >
                            {sample}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Loading indicator while LLM generates reply */}
              {isElderReplying && (
                <div className="flex items-start gap-2">
                  <img src="/assistant-avatar.jpg" alt="小助理" className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover" />
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-2 w-2 rounded-full bg-stone-300" style={{ animation: `elderTypingPulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                  <style>{`@keyframes elderTypingPulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
                </div>
              )}
            </div>
          </div>

          {/* Bottom input area - WeChat style */}
          <div className="shrink-0 bg-white/60 px-4 pb-[calc(4px+env(safe-area-inset-bottom))] pt-2">
            {/* Quick actions - subtle inline chips */}
            {/* 入口收拢：T0 修复后只保留“电话提醒”一个通话入口，避免“奶奶/妈妈”混乱 */}
            <div className="mb-2 flex flex-wrap gap-2 pb-1">
              <button
                type="button"
                onClick={() => {
                  if (!currentElderId) {
                    appendElderMessage({
                      id: uid("msg"),
                      role: "assistant",
                      kind: "text",
                      content: "还没绑定长辈身份呀，先在右上角选一下吧~",
                    });
                    return;
                  }
                  // 用 currentElderTask（锁定到当前 elder），不要用 latestElderTask
                  // 避免多个 elder 任务交叉时被别的 elder 名字污染
                  openCall(latestElderTask, "elder");
                }}
                className="shrink-0 rounded-full bg-orange-50 px-3 py-1.5 text-[12px] text-orange-700/80"
              >
                电话提醒
              </button>
              <button
                type="button"
                onClick={() => {
                  if (latestElderTask) {
                    appendElderMessage({
                      id: uid("msg"),
                      role: "assistant",
                      kind: "text",
                      content: `${currentElder?.displayName ?? "您"}，提醒你一下：${latestElderTask.content}`,
                    });
                  }
                }}
                className="shrink-0 rounded-full bg-orange-50 px-3 py-1.5 text-[12px] text-orange-700/80"
              >
                看提醒
              </button>
              <button
                type="button"
                onClick={() =>
                  appendElderMessage({
                    id: uid("msg"),
                    role: "assistant",
                    kind: "text",
                    content: buildAssistantPreview(assistantProfile, currentElder?.displayName ?? "您"),
                  })
                }
                className="shrink-0 rounded-full bg-orange-50 px-3 py-1.5 text-[12px] text-orange-700/80"
              >
                看小纸条
              </button>
            </div>


            {/* Input row */}
            <div className="flex items-center gap-2 pb-2">
              <textarea
                value={elderInput}
                onChange={(event) => setElderInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleElderSubmit();
                  }
                }}
                placeholder="直接回复我..."
                rows={1}
                className="min-h-10 flex-1 resize-none rounded-2xl bg-white px-3.5 py-2.5 text-[14px] text-stone-700 outline-none"
              />
              <button
                type="button"
                disabled={!elderInput.trim() || isElderReplying}
                onClick={() => handleElderSubmit()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white transition-colors disabled:bg-stone-200"
                style={{ backgroundColor: elderInput.trim() && !isElderReplying ? "#F2996E" : undefined }}
              >
                发送
              </button>
            </div>
          </div>
        </section>

        {/* ─── 身份卡片（手机号登录 + ID绑定）────────────────────── */}
        {identityCardOpen && identity && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-[2px]"
            onClick={() => setIdentityCardOpen(false)}
          >
            <div
              className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-[28px] border border-orange-100 bg-white p-5 shadow-[0_18px_50px_rgba(47,41,36,0.16)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold shadow-sm ${
                    identity.role === "child" ? "bg-[#F2996E] text-white" : "bg-[#FFF1C7] text-stone-700"
                  }`}
                >
                  {(identity.displayName ?? "我").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-stone-800">{identity.displayName ?? "我"}</p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {identity.role === "child" ? "子女身份" : "长辈身份"}
                    {identity.phone ? ` · ${identity.phone}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIdentityCardOpen(false)}
                  className="min-h-8 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-200"
                >
                  关闭
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-orange-50 px-4 py-3">
                <div>
                  <p className="text-xs text-stone-400">我的身份ID</p>
                  <p className="mt-0.5 text-sm font-bold tracking-wider text-[#F2996E]">{identity.userId ?? "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (identity.userId) {
                      navigator.clipboard?.writeText(identity.userId).then(
                        () => { setBindingToast("ID已复制到剪贴板"); setTimeout(() => setBindingToast(null), 2000); },
                        () => {},
                      );
                    }
                  }}
                  className="min-h-8 rounded-full bg-white px-3 py-1 text-xs text-stone-500 shadow-sm transition-colors hover:bg-stone-50"
                >
                  复制
                </button>
              </div>

              {bindingToast && (
                <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-xs text-emerald-600">
                  {bindingToast}
                </div>
              )}

              {myAccount?.boundPartnerId && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-stone-400">
                    ✓ 已绑定的{identity.role === "child" ? "长辈" : "子女"}
                  </p>
                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${identity.role === "child" ? "bg-[#FFF1C7] text-stone-700" : "bg-[#F2996E] text-white"}`}>
                      {(myAccount.boundPartnerName ?? "?").slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-700">{myAccount.boundPartnerName ?? "家人"}</p>
                      <p className="text-xs text-emerald-500">{myAccount.boundPartnerId} · 已连接</p>
                    </div>
                  </div>
                </div>
              )}

              {!myAccount?.boundPartnerId && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-stone-400">
                    {identity.role === "child" ? "📌 添加长辈ID" : "📎 添加子女ID"}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-300">输入对方的身份ID，发送请求等对方通过即可绑定</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={bindingInputId}
                      onChange={(e) => setBindingInputId(e.target.value.toUpperCase())}
                      placeholder="如 YD-1234"
                      maxLength={10}
                      className="min-h-10 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-800 outline-none transition-colors focus:border-[#F2996E] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={sendBindingRequest}
                      disabled={!bindingInputId.trim()}
                      className="min-h-10 shrink-0 rounded-full bg-[#F2996E] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      发送
                    </button>
                  </div>
                </div>
              )}

              {bindingRequests.filter((r) => r.toUserId === identity.userId && r.status === "pending").length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-stone-400">🔔 收到的绑定请求</p>
                  <div className="mt-2 space-y-2">
                    {bindingRequests
                      .filter((r) => r.toUserId === identity.userId && r.status === "pending")
                      .map((req) => (
                        <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/50 px-3 py-2">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${req.fromRole === "child" ? "bg-[#F2996E] text-white" : "bg-[#FFF1C7] text-stone-700"}`}>
                            {req.fromDisplayName.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-stone-700">{req.fromDisplayName}</p>
                            <p className="text-xs text-stone-400">{req.fromUserId} 想绑定你</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => approveBinding(req.id)}
                            className="min-h-8 shrink-0 rounded-full bg-[#F2996E] px-3 py-1 text-xs font-medium text-white"
                          >
                            通过
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectBinding(req.id)}
                            className="min-h-8 shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500"
                          >
                            拒绝
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {bindingRequests.filter((r) => r.fromUserId === identity.userId && r.status === "pending").length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-stone-400">⏳ 已发送的请求</p>
                  <div className="mt-2 space-y-2">
                    {bindingRequests
                      .filter((r) => r.fromUserId === identity.userId && r.status === "pending")
                      .map((req) => (
                        <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50 px-3 py-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-medium text-stone-500">?</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-stone-600">{req.toUserId}</p>
                            <p className="text-xs text-stone-400">等待对方确认...</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIdentityCardOpen(false);
                    clearIdentity();
                  }}
                  className="min-h-10 flex-1 rounded-full bg-[#F2996E] px-4 py-2 text-sm font-medium text-white"
                >
                  切换身份
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-stone-300">身份已记住在本设备，下次进来不用重选</p>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main
      className={`mx-auto max-w-5xl text-stone-800 ${
        activeTab === "home" ? "flex h-[100svh] flex-col overflow-hidden" : "min-h-screen px-3 py-4 sm:px-4 sm:py-6"
      }`}
    >
      {callSession.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(78,52,39,0.18)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[36px] border border-orange-100 bg-[linear-gradient(180deg,#FFF9F3_0%,#FFF3E7_100%)] p-6 shadow-[0_24px_60px_rgba(145,94,61,0.2)]">
            <div className="text-center">
              <img src="/assistant-avatar.jpg" alt="小助理" className="mx-auto h-20 w-20 rounded-full object-cover shadow-[0_14px_30px_rgba(242,153,110,0.3)]" />
              <p className="mt-4 text-xs font-medium tracking-[0.14em] text-orange-500">
                {callSession.phase === "dialing" && "正在给"}
                {(callSession.phase === "connected" || callSession.phase === "speaking" || callSession.phase === "listening") && "已接通"}
                {callSession.phase === "missed" && "未接通"}
                {callSession.phase === "ended" && "通话结束"}
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-800">{currentElder?.displayName ?? "长辈"}</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {callSession.phase === "dialing" && "正在拨打电话，请稍等..."}
                {(callSession.phase === "connected" || callSession.phase === "speaking") && "念念正在和TA聊天..."}
                {callSession.phase === "listening" && "TA正在回应念念..."}
                {callSession.phase === "missed" && "暂时没人接听，稍后会再试一次"}
                {callSession.phase === "ended" && `${currentCallTask?.title ?? "问候"}已完成`}
              </p>
              {(callSession.phase === "connected" || callSession.phase === "speaking" || callSession.phase === "listening" || callSession.phase === "ended") && (
                <div className="mt-4 rounded-[20px] border border-orange-100 bg-white/80 p-3 text-xs text-stone-500">
                  通话结束后，{currentElder?.displayName ?? "长辈"}的回复会自动同步给你
                </div>
              )}
              <button
                type="button"
                onClick={closeCall}
                className="mt-5 min-h-12 w-full rounded-full bg-white/80 px-4 py-2 text-sm text-stone-600"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Agent Call Modal ──────────────────────────────────────── */}
      {/* ─── Agent Call Modal 已删除（2025-01）────────────────────────── */}
      {/* 合并到 elder-call-conversation（openCall + CallSession）作为唯一通话入口，避免「奶奶/妈妈」称呼错乱 */}

      {/* ─── 右上角「我的身份」卡片（手机号登录 + ID绑定）────────────────────── */}
      {identityCardOpen && identity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => setIdentityCardOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-[28px] border border-orange-100 bg-white p-5 shadow-[0_18px_50px_rgba(47,41,36,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* 当前身份 */}
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold shadow-sm ${
                  identity.role === "child" ? "bg-[#F2996E] text-white" : "bg-[#FFF1C7] text-stone-700"
                }`}
              >
                {(identity.displayName ?? "我").slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-stone-800">
                  {identity.displayName ?? "我"}
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {identity.role === "child" ? "子女身份" : "长辈身份"}
                  {identity.phone ? ` · ${identity.phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIdentityCardOpen(false)}
                className="min-h-8 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-200"
              >
                关闭
              </button>
            </div>

            {/* 身份ID展示 */}
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-orange-50 px-4 py-3">
              <div>
                <p className="text-xs text-stone-400">我的身份ID</p>
                <p className="mt-0.5 text-sm font-bold tracking-wider text-[#F2996E]">{identity.userId ?? "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (identity.userId) {
                    navigator.clipboard?.writeText(identity.userId).then(
                      () => { setBindingToast("ID已复制到剪贴板"); setTimeout(() => setBindingToast(null), 2000); },
                      () => {},
                    );
                  }
                }}
                className="min-h-8 rounded-full bg-white px-3 py-1 text-xs text-stone-500 shadow-sm transition-colors hover:bg-stone-50"
              >
                复制
              </button>
            </div>

            {/* 绑定提示 toast */}
            {bindingToast && (
              <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-xs text-emerald-600">
                {bindingToast}
              </div>
            )}

            {/* 已绑定的家人 */}
            {myAccount?.boundPartnerId && (
              <div className="mt-4">
                <p className="text-xs font-medium text-stone-400">
                  ✓ 已绑定的{identity.role === "child" ? "长辈" : "子女"}
                </p>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${identity.role === "child" ? "bg-[#FFF1C7] text-stone-700" : "bg-[#F2996E] text-white"}`}>
                    {(myAccount.boundPartnerName ?? "?").slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-700">{myAccount.boundPartnerName ?? "家人"}</p>
                    <p className="text-xs text-emerald-500">{myAccount.boundPartnerId} · 已连接</p>
                  </div>
                </div>
              </div>
            )}

            {/* 添加绑定 */}
            {!myAccount?.boundPartnerId && (
              <div className="mt-4">
                <p className="text-xs font-medium text-stone-400">
                  {identity.role === "child" ? "📌 添加长辈ID" : "📎 添加子女ID"}
                </p>
                <p className="mt-1 text-[11px] text-stone-300">输入对方的身份ID，发送请求等对方通过即可绑定</p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={bindingInputId}
                    onChange={(e) => setBindingInputId(e.target.value.toUpperCase())}
                    placeholder="如 YD-1234"
                    maxLength={10}
                    className="min-h-10 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-800 outline-none transition-colors focus:border-[#F2996E] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={sendBindingRequest}
                    disabled={!bindingInputId.trim()}
                    className="min-h-10 shrink-0 rounded-full bg-[#F2996E] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    发送
                  </button>
                </div>
              </div>
            )}

            {/* 待处理的绑定请求（收到的） */}
            {bindingRequests.filter((r) => r.toUserId === identity.userId && r.status === "pending").length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-stone-400">🔔 收到的绑定请求</p>
                <div className="mt-2 space-y-2">
                  {bindingRequests
                    .filter((r) => r.toUserId === identity.userId && r.status === "pending")
                    .map((req) => (
                      <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/50 px-3 py-2">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${req.fromRole === "child" ? "bg-[#F2996E] text-white" : "bg-[#FFF1C7] text-stone-700"}`}>
                          {req.fromDisplayName.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-700">{req.fromDisplayName}</p>
                          <p className="text-xs text-stone-400">{req.fromUserId} 想绑定你</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => approveBinding(req.id)}
                          className="min-h-8 shrink-0 rounded-full bg-[#F2996E] px-3 py-1 text-xs font-medium text-white"
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectBinding(req.id)}
                          className="min-h-8 shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500"
                        >
                          拒绝
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 已发送的请求（等待确认） */}
            {bindingRequests.filter((r) => r.fromUserId === identity.userId && r.status === "pending").length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-stone-400">⏳ 已发送的请求</p>
                <div className="mt-2 space-y-2">
                  {bindingRequests
                    .filter((r) => r.fromUserId === identity.userId && r.status === "pending")
                    .map((req) => (
                      <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50 px-3 py-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-medium text-stone-500">
                          ?
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-stone-600">{req.toUserId}</p>
                          <p className="text-xs text-stone-400">等待对方确认...</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 操作 */}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIdentityCardOpen(false);
                  clearIdentity();
                }}
                className="min-h-10 flex-1 rounded-full bg-[#F2996E] px-4 py-2 text-sm font-medium text-white"
              >
                切换身份
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-stone-300">
              身份已记住在本设备，下次进来不用重选
            </p>
          </div>
        </div>
      )}

      {isPeopleDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[2px]"
          onClick={() => setIsPeopleDrawerOpen(false)}
        >
          <aside
            className="h-full w-full max-w-sm overflow-y-auto border-r border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(47,41,36,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rounded-[24px] bg-[#FFF1C7] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-orange-600">我惦记的人</p>
                  <p className="mt-2 text-lg font-semibold">切换长辈，不会清空当前聊天记录</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPeopleDrawerOpen(false)}
                  className="min-h-12 rounded-full bg-white/80 px-4 py-2 text-xs text-stone-600"
                >
                  收起
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {elders.map((elder) => {
                const elderTasks = tasks.filter((task) => task.elderId === elder.id);
                const doneCount = elderTasks.filter((task) => task.status === "completed").length;
                const pendingCount = elderTasks.filter((task) =>
                  ["scheduled", "unconfirmed", "timeout", "need_review"].includes(task.status),
                ).length;
                const active = elder.id === currentElderId;

                return (
                  <button
                    key={elder.id}
                    type="button"
                    onClick={() => {
                      setCurrentElderId(elder.id);
                      setIsPeopleDrawerOpen(false);
                    }}
                className={`min-h-24 w-full rounded-2xl border px-4 py-3 text-left ${active ? "border-orange-300 bg-orange-50/70" : "border-stone-100 bg-stone-50/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{elder.displayName}</p>
                      <span className="text-xs text-stone-500">{active ? "当前" : elder.relation}</span>
                    </div>
                    <p className="mt-2 text-sm text-stone-600">
                      今日：{doneCount} 完成 / {pendingCount} 待跟进
                    </p>
                    <p className="mt-1 text-xs text-stone-500">最近回应：{elder.recentResponseAt ?? "暂无"}</p>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      <section className={activeTab === "home" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "space-y-3 pb-24"}>
        {activeTab === "home" && (
          <>
            {/* Clean header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <img src="/assistant-avatar.jpg" alt="小助理" className="h-8 w-8 rounded-full object-cover" />
                <div>
                  <p className="text-[15px] font-semibold leading-tight text-stone-800">小助理：念念</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-stone-400">
                    {currentElder ? `当前惦记：${currentElder.relation ?? currentElder.displayName}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-stone-400">
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className="text-stone-400 transition-colors hover:text-stone-600"
                >
                  档案
                </button>
                <span className="text-stone-200">|</span>
                <button
                  type="button"
                  onClick={() => setIsPeopleDrawerOpen(true)}
                  className="text-stone-400 transition-colors hover:text-stone-600"
                >
                  切换长辈
                </button>
                <span className="text-stone-200">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setIdentityCardOpen(true);
                    refreshAccountInfo();
                  }}
                  className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#F2996E] text-sm font-medium text-white shadow-sm transition-transform hover:scale-105"
                  aria-label="我的身份"
                  title={identity?.displayName ?? "我"}
                >
                  {(identity?.displayName ?? "我").slice(0, 1)}
                </button>
              </div>
            </div>

            <div ref={childChatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <div className="space-y-3">
                {/* Today summary - subtle inline */}
                <div
                  className={`mx-auto w-fit max-w-full rounded-full bg-orange-50 px-3 ${
                    isSummaryExpanded ? "py-2" : "py-1.5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setIsSummaryExpanded((prev) => !prev)}
                    className="flex items-center gap-2 text-[11px] text-stone-400"
                  >
                    <span>今日跟进</span>
                    <span className="text-stone-300">{isSummaryExpanded ? "收起" : "展开"}</span>
                  </button>
                  {isSummaryExpanded && <p className="mt-1 text-center text-[12px] leading-5 text-stone-500">{currentSummary}</p>}
                </div>

                {/* 念念帮你惦记了X件事 */}
                <p className="px-4 text-center text-[13px] leading-6 text-stone-400">
                  {(() => {
                    const trackedTasks = currentElder ? tasks.filter((t) => t.elderId === currentElder.id) : tasks;
                    const elderName = currentElder?.displayName ?? "家人";
                    return `念念帮你惦记了${elderName}${trackedTasks.length}件事...`;
                  })()}
                </p>

                {/* Proactive care suggestions (Step 5) */}
                {proactiveSuggestions.length > 0 && (
                  <div className="space-y-2">
                    {proactiveSuggestions.map((sug, i) => (
                      <div key={`proactive-${i}`} className="flex items-start gap-2">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-500">心</div>
                        <div className="flex-1 rounded-2xl rounded-tl-md bg-white/80 px-3.5 py-2.5">
                          <p className="text-[14px] leading-6 text-stone-600">{sug.text}</p>
                          {sug.action && (
                            <button
                              type="button"
                              onClick={() => {
                                if (sug.action === "打电话") {
                                  const elder = elders.find((e) => e.id === sug.elderId);
                                  if (elder) {
                                    const task = tasks.find(
                                      (t) => t.elderId === elder.id && t.status !== "completed" && t.status !== "confirmed",
                                    );
                                    openCall(task ?? null, "child");
                                  }
                                } else if (sug.action === "用这句") {
                                  const insight = callInsights[0];
                                  if (insight?.suggestedMessage) {
                                    setInput(insight.suggestedMessage);
                                  }
                                }
                              }}
                              className="mt-1.5 text-[12px] font-medium text-[#F2996E]"
                            >
                              {sug.action} →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex items-start gap-2 ${message.role === "user" ? "justify-end" : ""}`} {...(message.role === "assistant" ? { "data-assistant-message": "true" } : {})}>
                    {message.role === "assistant" && (
                      <img src="/assistant-avatar.jpg" alt="小助理" className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover" />
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 ${
                      message.role === "user"
                        ? "rounded-tr-md bg-[#F2996E] text-white"
                        : "rounded-tl-md bg-white text-stone-700"
                    }`}>
                      <p>{message.content}</p>
                      {message.kind === "taskDraft" && message.drafts && (
                        <div className="mt-2.5 space-y-2.5">
                          {message.drafts.map((draft) => (
                            <div key={draft.id} className="rounded-xl bg-orange-50/60 p-3">
                              <p className="text-[13px] font-semibold text-stone-800">{draft.title}</p>
                              <div className="mt-2 space-y-1 text-[12px] text-stone-500">
                                <div className="flex gap-2">
                                  <span className="w-8 shrink-0 text-stone-400">对象</span>
                                  <span>{draft.elderDisplayName}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-8 shrink-0 text-stone-400">时间</span>
                                  <span>{draft.remindLabel}</span>
                                  {draft.repeatRule === "daily" && <span className="text-orange-400">每日</span>}
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-8 shrink-0 text-stone-400">方式</span>
                                  <span>{draft.channel}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="w-8 shrink-0 text-stone-400">提醒</span>
                                  <span>{draft.content}</span>
                                </div>
                                {draft.relayMessage && (
                                  <div className="flex gap-2">
                                    <span className="w-8 shrink-0 text-stone-400">传话</span>
                                    <span className="text-orange-600">{draft.relayMessage}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-3">
                                <button
                                  type="button"
                                  disabled={draft.created}
                                  onClick={() => createTaskFromDraft(draft)}
                                  className={`min-h-9 rounded-full px-4 py-1.5 text-[12px] font-medium ${draft.created ? "bg-stone-100 text-stone-400" : "bg-[#F2996E] text-white"}`}
                                >
                                  {draft.created ? "已创建" : "确认创建"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.kind === "note" && message.noteVersions && (
                        <div className="mt-2.5 space-y-2">
                          {message.noteVersions.map((version) => (
                            <div key={version.style} className="rounded-xl bg-orange-50/60 p-3">
                              <p className="text-[11px] text-stone-400">{version.style}</p>
                              <p className="mt-1.5 text-[13px] text-stone-600">{version.text}</p>
                              <button
                                type="button"
                                onClick={() => sendNote(version)}
                                className="mt-2 min-h-9 rounded-full bg-white px-3 py-1.5 text-[12px] text-stone-600"
                              >
                                发给{currentElder?.displayName ?? "长辈"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.role === "assistant" && message.kind === "text" && message.id === messages[0]?.id && (
                        <div className="mt-2.5 border-t border-black/5 pt-2">
                          <p className="text-[11px] text-stone-400">试试这些</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {QUICK_INPUTS.map((sample) => (
                              <button
                                key={sample}
                                type="button"
                                onClick={() => { setInput(sample); scrollToLatestAssistant(); }}
                                className="text-[12px] text-[#F2996E]"
                              >
                                {sample}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isSubmitting && (
                  <div className="flex items-start gap-2">
                    <img src="/assistant-avatar.jpg" alt="小助理" className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover" />
                    <div className="rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-6 text-stone-400">
                      正在帮你想一想...
                    </div>
                  </div>
                )}
              </div>
            </div>

          </>
        )}

        {activeTab === "tasks" && (
          <div className="space-y-3 pb-24">
            {/* Scheduler toggle */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">任务</h2>
              <button
                type="button"
                onClick={triggerSchedulerTick}
                className="min-h-10 rounded-full bg-violet-100 px-4 py-2 text-xs font-medium text-violet-700"
              >
                调度器 Tick
              </button>
            </div>
            {schedulerResult && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 whitespace-pre-wrap">
                {schedulerResult}
              </div>
            )}

            {/* Simple task cards */}
            {sortedTasks.map((task) => (
              <div key={task.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(selectedTaskId === task.id ? null : task.id)}
                  className="w-full rounded-[20px] border border-orange-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(242,153,110,0.08)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stone-800">{task.title}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {task.elderDisplayName} | {task.remindLabel} | {task.channel}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                </button>

                {/* Expandable task detail */}
                {selectedTaskId === task.id && (
                  <div className="mt-2 space-y-3 rounded-[20px] border border-orange-200 bg-orange-50/30 p-4">
                    {/* Task info */}
                    <div className="space-y-1.5 text-sm text-stone-600">
                      <p>任务内容：{task.content}</p>
                      <p>回执要求：{task.needResult ? "需要结果" : "确认收到即可"}</p>
                      <p>最近回复：{task.result ?? "还没有明确回复"}</p>
                      {task.relayMessage && (
                        <p className="text-orange-600">传话内容：{task.relayMessage}</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyTaskStatus(task, "completed", task.needResult ? "血糖 6.1" : "做完了")}
                        className="min-h-10 rounded-full bg-emerald-100 px-4 py-2 text-xs text-emerald-700"
                      >
                        标记完成
                      </button>
                    </div>

                    {/* Execution records - expandable */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-stone-500">执行记录</p>
                      <div className="space-y-2">
                        {[...task.logs].reverse().map((log) => {
                          const isExpanded = expandedLogId === log.id;
                          return (
                            <div key={log.id}>
                              <button
                                type="button"
                                onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white px-3 py-2 text-left text-sm text-stone-600"
                              >
                                <span className="flex-1 truncate">{log.event}</span>
                                <span className="ml-2 shrink-0 text-xs text-stone-400">{log.time}</span>
                              </button>
                              {isExpanded && (
                                <div className="mt-1 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-500">
                                  {log.event}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {sortedTasks.length === 0 && (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-stone-400">
                还没有任务，在小助理里说点什么吧。
              </div>
            )}
          </div>
        )}

        {activeTab === "profile" && (
          <div className="space-y-4 pb-24">
            {/* Back button + header */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("home")}
                className="min-h-10 rounded-full bg-orange-50 px-4 text-sm text-orange-600"
              >
                返回
              </button>
              <h2 className="text-lg font-semibold">长辈档案</h2>
            </div>
            {/* Elder detail view */}
            {elderDetailId ? (
              (() => {
                const detailElder = elders.find((e) => e.id === elderDetailId);
                if (!detailElder) return null;
                // ── 从记忆库动态派生档案内容 ──
                const elderMems = memoryEntries.filter((m) => m.elderId === detailElder.id);
                const healthMems = elderMems.filter((m) => m.category === "elder_health");
                const habitsMems = elderMems.filter((m) => m.category === "elder_habits");
                const basicMems = elderMems.filter((m) => m.category === "elder_basic");
                const contactMems = elderMems.filter((m) => m.category === "elder_contact");
                const chatMems = elderMems.filter((m) => ["chat_expression", "chat_focus", "chat_language", "chat_taboo"].includes(m.category));
                const relPrefMems = elderMems.filter((m) => m.category === "rel_preferences");
                const coreMems = elderMems.filter((m) => ["relationship", "rel_emotional", "rel_events", "rel_history"].includes(m.category));
                const pendingMems = elderMems.filter((m) => m.category === "pending_review");
                return (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => setElderDetailId(null)}
                      className="min-h-10 rounded-full bg-orange-50 px-4 text-sm text-orange-600"
                    >
                      返回档案列表
                    </button>
                    <div className="rounded-[28px] border border-orange-100 bg-white p-5 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-200 to-orange-300 text-2xl font-semibold text-stone-700">
                          {detailElder.displayName.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold">{detailElder.displayName}</h2>
                          <p className="text-sm text-stone-500">{detailElder.oneLinePortrait ?? detailElder.relation}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => beginEditElder(detailElder)}
                          className="ml-auto min-h-10 rounded-full bg-orange-50 px-4 text-xs font-medium text-stone-700"
                        >
                          编辑
                        </button>
                      </div>
                    </div>

                    {/* Health section — 从记忆库 elder_health + elder_habits 派生 */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">身体状况</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(detailElder.healthFocus ?? detailElder.focus).map((item) => (
                          <span key={item} className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-600">{item}</span>
                        ))}
                      </div>
                      {healthMems.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {healthMems.map((mem) => (
                            <div key={mem.id} className="flex gap-1.5">
                              <span className="mt-0.5 text-rose-300 text-xs">●</span>
                              <span className="text-xs leading-relaxed text-stone-600">{mem.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {habitsMems.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {habitsMems.map((mem) => (
                            <p key={mem.id} className="text-xs text-stone-500">{mem.content}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Personality & Communication — 从记忆库 chat_* + rel_preferences 派生 */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">性格与沟通偏好</p>
                      <div className="mt-2 space-y-1.5">
                        {(detailElder.personalityTraits ?? []).map((trait, i) => (
                          <p key={i} className="text-sm text-stone-600">{trait}</p>
                        ))}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {detailElder.communicationPreference.map((pref) => (
                            <span key={pref} className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-600">{pref}</span>
                          ))}
                        </div>
                        {/* 从记忆库同步的沟通偏好条目 */}
                        {chatMems.length > 0 && (
                          <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-2">
                            {chatMems.map((mem) => (
                              <div key={mem.id} className="flex gap-1.5">
                                <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                                  mem.category === "chat_taboo" ? "bg-red-50 text-red-500" :
                                  mem.category === "chat_expression" ? "bg-orange-50 text-orange-500" :
                                  "bg-sky-50 text-sky-500"
                                }`}>
                                  {mem.category === "chat_taboo" ? "禁忌" : mem.category === "chat_expression" ? "表达" : mem.category === "chat_focus" ? "重点" : "语言"}
                                </span>
                                <span className="text-xs leading-relaxed text-stone-600">{mem.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {relPrefMems.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {relPrefMems.map((mem) => (
                              <div key={mem.id} className="flex gap-1.5">
                                <span className="mt-0.5 text-emerald-300 text-xs">●</span>
                                <span className="text-xs leading-relaxed text-stone-600">{mem.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Core memories — 从记忆库 relationship/rel_* 派生 */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">和你的核心记忆</p>
                      <div className="mt-2 space-y-2">
                        {/* 先展示 Elder 对象原有核心记忆 */}
                        {(detailElder.relationshipMemories ?? []).map((mem, i) => (
                          <div key={`e${i}`} className="flex gap-2 text-sm text-stone-600">
                            <span className="text-orange-400">-</span>
                            <span>{mem}</span>
                          </div>
                        ))}
                        {/* 再从记忆库同步的关系记忆条目（去重） */}
                        {coreMems.map((mem) => (
                          <div key={mem.id} className="flex gap-2 text-sm text-stone-600">
                            <span className="text-orange-400">-</span>
                            <span>{mem.content}</span>
                          </div>
                        ))}
                        {/* 待审核的情绪信号 */}
                        {pendingMems.length > 0 && (
                          <div className="mt-2 border-t border-stone-100 pt-2">
                            {pendingMems.map((mem) => (
                              <div key={mem.id} className="flex gap-2 text-xs text-violet-500">
                                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px]">待确认</span>
                                <span>{mem.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Basic info — 从记忆库 elder_basic + elder_contact 补充 */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">基础信息</p>
                      <div className="mt-2 space-y-1 text-sm text-stone-600">
                        <p>关系：{detailElder.relation}</p>
                        <p>电话：{detailElder.phone}</p>
                        <p>方便时间：{detailElder.availableTime}</p>
                        <p>回应习惯：{detailElder.responseHabit || "待补充"}</p>
                        {/* 从记忆库同步的补充信息 */}
                        {basicMems.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-stone-100 pt-2">
                            {basicMems.map((mem) => (
                              <p key={mem.id} className="text-xs leading-relaxed text-stone-500">{mem.content}</p>
                            ))}
                          </div>
                        )}
                        {contactMems.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {contactMems.map((mem) => (
                              <p key={mem.id} className="text-xs leading-relaxed text-stone-500">{mem.content}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                {/* Card grid */}
                <div className="grid grid-cols-2 gap-3">
                  {elders.map((elder) => (
                    <button
                      key={elder.id}
                      type="button"
                      onClick={() => setElderDetailId(elder.id)}
                      className="flex min-h-[140px] flex-col justify-between rounded-[24px] border border-orange-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(242,153,110,0.08)] transition active:scale-[0.98]"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-semibold text-stone-800">{elder.displayName}</p>
                          <span className={`h-2.5 w-2.5 rounded-full ${elder.recentResponseAt ? "bg-emerald-400" : "bg-amber-300"}`} />
                        </div>
                        <p className="mt-2 text-sm leading-5 text-stone-500">{elder.oneLinePortrait ?? elder.relation}</p>
                      </div>
                      <p className="mt-2 text-xs text-stone-400">{elder.recentResponseAt ?? "暂未联系"}</p>
                    </button>
                  ))}
                </div>
        
                {/* Add elder button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!editingElderId) resetForm();
                    setShowAddElder(true);
                  }}
                  className="min-h-12 w-full rounded-[20px] border border-dashed border-orange-200 bg-orange-50/40 text-sm text-orange-500"
                >
                  + 添加一位长辈
                </button>
        
                {/* Add elder form (collapsible) */}
                {showAddElder && (
                  <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">{editingElderId ? "编辑长辈" : "添加一位长辈"}</h2>
                      <button
                        type="button"
                        onClick={() => { setShowAddElder(false); setEditingElderId(null); resetForm(); }}
                        className="min-h-12 rounded-full bg-orange-50 px-4 py-2 text-xs text-orange-600"
                      >
                        收起
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      <select
                        value={elderForm.relation}
                        onChange={(event) => setElderForm((prev) => ({ ...prev, relation: event.target.value }))}
                        className="min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
                      >
                        {RELATION_OPTIONS.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                      <input
                        value={elderForm.displayName}
                        onChange={(event) => setElderForm((prev) => ({ ...prev, displayName: event.target.value }))}
                        placeholder="显示称呼"
                        className="min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
                      />
                      <input
                        value={elderForm.phone}
                        onChange={(event) => setElderForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="手机号"
                        className="min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
                      />
                      <input
                        value={elderForm.availableTime}
                        onChange={(event) => setElderForm((prev) => ({ ...prev, availableTime: event.target.value }))}
                        placeholder="方便接电话时间"
                        className="min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
                      />
                      <textarea
                        value={elderForm.responseHabit}
                        onChange={(event) => setElderForm((prev) => ({ ...prev, responseHabit: event.target.value }))}
                        placeholder="响应习惯，比如：上午容易接电话，晚上不怎么看手机"
                        className="min-h-24 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
                      />
                      <button
                        type="button"
                        onClick={createElder}
                        className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-sm font-medium text-white"
                      >
                        {editingElderId ? "保存修改" : "保存长辈档案"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "assistant" && (
          <div className="space-y-3 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">记忆库</h2>
            </div>

            {/* Main tabs - segmented control */}
            <div className="flex rounded-full bg-orange-50 p-1">
              {([
                { key: "family_info" as const, label: "家人信息" },
                { key: "relationship" as const, label: "关系" },
                { key: "chat_style" as const, label: "聊天风格" },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setMemMainTab(tab.key); setMemSubTab("all"); }}
                  className={`flex-1 rounded-full py-2 text-[12px] font-medium transition-all ${
                    memMainTab === tab.key ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sub tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setMemSubTab("all")}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  memSubTab === "all" ? "bg-[#F2996E] text-white" : "bg-orange-50 text-orange-700/80"
                }`}
              >
                全部
              </button>
              {MEM_SUB_CATS[memMainTab].map((sub) => (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => setMemSubTab(sub.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    memSubTab === sub.key ? "bg-[#F2996E] text-white" : "bg-orange-50 text-orange-700/80"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowAddMem((v) => !v); setNewMemoryText(""); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 py-3.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                记录
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 py-3.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                导入
              </button>
            </div>

            {/* Add memory form (inline) */}
            {showAddMem && (
              <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-stone-700">记录新记忆</p>
                <textarea
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                  placeholder="比如：妈妈不喜欢别人说她身体不好"
                  className="mt-2 min-h-20 w-full resize-none rounded-xl border border-orange-100 bg-orange-50/60 px-3.5 py-3 text-sm outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <select
                    value={addMemSubCat}
                    onChange={(e) => setAddMemSubCat(e.target.value as MemoryCategory)}
                    className="min-h-10 rounded-full border border-orange-100 bg-orange-50/60 px-3 text-sm"
                  >
                    {MEM_SUB_CATS[memMainTab].map((sub) => (
                      <option key={sub.key} value={sub.key}>{sub.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const text = newMemoryText.trim();
                      if (!text) return;
                      setMemoryEntries((prev) => [...prev, {
                        id: uid("mem"),
                        category: addMemSubCat,
                        content: text,
                        source: "user_manual_input",
                        importance: "medium",
                        createdAt: nowLabel(),
                      }]);
                      setNewMemoryText("");
                      setShowAddMem(false);
                    }}
                    className="min-h-10 flex-1 rounded-full bg-[#F2996E] px-4 text-sm font-medium text-white"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddMem(false); setNewMemoryText(""); }}
                    className="min-h-10 rounded-full bg-stone-100 px-4 text-sm text-stone-600"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Memory list */}
            {(() => {
              const filteredEntries = memoryEntries.filter((m) => {
                if (memSubTab === "all") {
                  return MEM_MAIN_TAB_CATS[memMainTab].includes(m.category);
                }
                return m.category === memSubTab;
              });

              if (filteredEntries.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-300">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                      </svg>
                    </div>
                    <p className="mt-4 text-sm font-medium text-stone-500">暂无记忆</p>
                    <p className="mt-1 text-xs text-stone-400">点击「记录」开始添加</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {filteredEntries.map((mem) => (
                    <div key={mem.id} className="rounded-2xl bg-white p-3.5 shadow-sm">
                      {editingMemId === mem.id ? (
                        <div>
                          <textarea
                            value={editingMemText}
                            onChange={(e) => setEditingMemText(e.target.value)}
                            className="min-h-16 w-full resize-none rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2.5 text-sm outline-none"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const text = editingMemText.trim();
                                if (!text) return;
                                setMemoryEntries((prev) => prev.map((m) => m.id === mem.id ? { ...m, content: text } : m));
                                setEditingMemId(null);
                                setEditingMemText("");
                              }}
                              className="min-h-9 rounded-full bg-[#F2996E] px-4 text-xs font-medium text-white"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingMemId(null); setEditingMemText(""); }}
                              className="min-h-9 rounded-full bg-stone-100 px-4 text-xs text-stone-600"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm leading-relaxed text-stone-700">{mem.content}</p>
                          <div className="mt-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-stone-400">{mem.createdAt}</span>
                              {mem.importance === "high" && (
                                <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-600">重要</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => { setEditingMemId(mem.id); setEditingMemText(mem.content); }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                                title="编辑"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setMemoryEntries((prev) => prev.filter((m) => m.id !== mem.id))}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                title="删除"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Import modal */}
            {showImportModal && (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
                onClick={() => resetImportModal()}
              >
                <div
                  className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white p-6 sm:rounded-3xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-stone-800">导入记忆</h3>
                    <button
                      type="button"
                      onClick={() => resetImportModal()}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">支持病历图片、聊天记录、Word、PDF，自动识别文字并提炼事实</p>

                  {/* OCR health banner */}
                  {ocrAvailable === false && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      OCR 服务未启动，图片与扫描件 PDF 暂不可用。
                      <code className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">npm run ocr:start</code>
                    </div>
                  )}
                  {ocrAvailable === true && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                      ✓ OCR 服务就绪
                    </div>
                  )}

                  {/* File upload area - only show when not yet uploaded or in manual mode */}
                  {importStatus === "idle" && (
                    <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40 py-8 transition-colors hover:border-orange-300 hover:bg-orange-50/60">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-400">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                      </svg>
                      <p className="mt-2 text-sm text-stone-600">点击上传图片或文档</p>
                      <p className="mt-0.5 text-xs text-stone-400">JPG · PNG · WebP · DOCX · PDF · TXT</p>
                      <input
                        type="file"
                        accept="image/*,.docx,.pdf,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleImportFile(file);
                          e.target.value = ""; // 允许选同一个文件
                        }}
                      />
                    </label>
                  )}

                  {/* Progress display */}
                  {importStatus !== "idle" && importStatus !== "done" && importStatus !== "error" && (
                    <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-orange-100 bg-orange-50/30 px-4 py-6">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-[#F2996E]" />
                      <p className="mt-3 text-sm text-stone-700">
                        {importStatus === "uploading" && "正在上传…"}
                        {importStatus === "parsing" && (
                          <>
                            正在解析 {importFileMeta?.name ?? "文件"}
                            {importFileMeta?.parser === "pdf-ocr" && "（扫描件，需 OCR）"}
                            …
                          </>
                        )}
                        {importStatus === "extracting" && "念念正在帮你提炼关键信息…"}
                      </p>
                      {importFileMeta?.size !== undefined && (
                        <p className="mt-1 text-[11px] text-stone-400">
                          {(importFileMeta.size / 1024).toFixed(0)} KB
                        </p>
                      )}
                    </div>
                  )}

                  {/* Error display */}
                  {importStatus === "error" && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-800">
                      <p className="font-medium">{importError ?? "处理失败"}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setImportStatus("idle");
                          setImportError(null);
                          setImportFileMeta(null);
                        }}
                        className="mt-2 text-[11px] text-rose-600 underline"
                      >
                        重试 / 换文件
                      </button>
                    </div>
                  )}

                  {/* Done state: split view (raw text + candidates) */}
                  {importStatus === "done" && importFileMeta && !importManualMode && (
                    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                      {/* Header meta */}
                      <div className="flex items-center justify-between text-[11px] text-stone-500">
                        <span>
                          {importFileMeta.name} · {importFileMeta.parser} · {importFileMeta.durationMs}ms
                        </span>
                        <button
                          type="button"
                          onClick={() => setImportManualMode(true)}
                          className="text-stone-500 underline"
                        >
                          改为手动贴入
                        </button>
                      </div>

                      {/* Tabs for candidate groups */}
                      <div className="flex gap-1 rounded-full bg-stone-100 p-1">
                        {(["family_info", "relationship", "chat_style"] as const).map((tab) => {
                          const count = importCandidates.filter(
                            (c) => MAIN_TAB_BY_CATEGORY[c.category] === tab,
                          ).length;
                          return (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setImportCandidateTab(tab)}
                              className={`flex-1 rounded-full py-1.5 text-[12px] font-medium transition-colors ${
                                importCandidateTab === tab ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"
                              }`}
                            >
                              {MAIN_TAB_LABEL[tab]} {count > 0 && <span className="text-stone-400">({count})</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Body: split view */}
                      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2">
                        {/* Left: raw text */}
                        <details className="rounded-xl border border-stone-200 bg-stone-50/50">
                          <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-stone-600">
                            原文（可点开查看）
                          </summary>
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[11px] text-stone-700">
                            {importRawText || "（原文为空）"}
                          </pre>
                        </details>

                        {/* Right: candidates for current tab */}
                        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border border-orange-100 bg-orange-50/30 p-2">
                          {importCandidates.filter(
                            (c) => MAIN_TAB_BY_CATEGORY[c.category] === importCandidateTab,
                          ).length === 0 ? (
                            <p className="px-2 py-4 text-center text-[11px] text-stone-400">
                              {importCandidates.length === 0
                                ? "念念没找到可提炼的内容，可以手动从原文复制"
                                : `本分类无候选（共 ${importCandidates.length} 条在其他分类）`}
                            </p>
                          ) : (
                            importCandidates
                              .filter((c) => MAIN_TAB_BY_CATEGORY[c.category] === importCandidateTab)
                              .map((c) => (
                                <div
                                  key={c.id}
                                  className="rounded-lg border border-orange-200/60 bg-white p-2.5"
                                >
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={c.selected}
                                      onChange={(e) => {
                                        setImportCandidates((prev) =>
                                          prev.map((p) =>
                                            p.id === c.id ? { ...p, selected: e.target.checked } : p,
                                          ),
                                        );
                                      }}
                                      className="mt-1 h-4 w-4 shrink-0 accent-[#F2996E]"
                                    />
                                    <div className="min-w-0 flex-1">
                                      {editingCandidateId === c.id ? (
                                        <textarea
                                          value={editingCandidateText}
                                          onChange={(e) => setEditingCandidateText(e.target.value)}
                                          onBlur={() => {
                                            setImportCandidates((prev) =>
                                              prev.map((p) =>
                                                p.id === c.id ? { ...p, content: editingCandidateText } : p,
                                              ),
                                            );
                                            setEditingCandidateId(null);
                                          }}
                                          autoFocus
                                          className="min-h-12 w-full resize-none rounded border border-orange-200 px-2 py-1 text-[12px] outline-none"
                                        />
                                      ) : (
                                        <p
                                          className="cursor-text text-[12px] text-stone-800"
                                          onClick={() => {
                                            setEditingCandidateId(c.id);
                                            setEditingCandidateText(c.content);
                                          }}
                                        >
                                          {c.content}
                                        </p>
                                      )}
                                      <p className="mt-1 text-[10px] text-stone-400">
                                        {SUB_CAT_LABEL[c.category]} · 置信 {Math.round(c.confidence * 100)}%
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setImportCandidates((prev) => prev.filter((p) => p.id !== c.id));
                                      }}
                                      className="shrink-0 text-stone-300 hover:text-rose-500"
                                      aria-label="删除"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Confirm bar */}
                      <div className="flex gap-2 border-t border-stone-100 pt-3">
                        <button
                          type="button"
                          onClick={() => resetImportModal()}
                          className="min-h-10 shrink-0 rounded-full border border-stone-200 px-4 text-sm text-stone-600"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={importCandidates.filter((c) => c.selected).length === 0}
                          onClick={() => confirmImportCandidates()}
                          className="min-h-10 flex-1 rounded-full bg-[#F2996E] text-sm font-medium text-white disabled:bg-stone-200"
                        >
                          导入 {importCandidates.filter((c) => c.selected).length} 条
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Manual mode: original behavior preserved for fallback */}
                  {importStatus === "done" && importManualMode && (
                    <div className="mt-4 flex flex-1 flex-col gap-3 overflow-hidden">
                      <div className="flex items-center justify-between text-[11px] text-stone-500">
                        <span>手动贴入模式</span>
                        <button
                          type="button"
                          onClick={() => setImportManualMode(false)}
                          className="text-stone-500 underline"
                        >
                          返回候选
                        </button>
                      </div>
                      {importFilePreview && (
                        <div className="overflow-hidden rounded-xl border border-stone-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={importFilePreview} alt="预览" className="max-h-32 w-full object-cover" />
                        </div>
                      )}
                      <textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder="识别结果将显示在这里，可手动编辑..."
                        className="min-h-24 w-full resize-none rounded-xl border border-orange-100 bg-orange-50/60 px-3.5 py-3 text-sm outline-none"
                      />
                      <div className="flex gap-2">
                        <select
                          value={addMemSubCat}
                          onChange={(e) => setAddMemSubCat(e.target.value as MemoryCategory)}
                          className="min-h-10 flex-1 rounded-full border border-orange-100 bg-orange-50/60 px-3 text-sm"
                        >
                          {MEM_SUB_CATS[memMainTab].map((sub) => (
                            <option key={sub.key} value={sub.key}>{sub.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!importText.trim()}
                          onClick={() => confirmManualImport()}
                          className="min-h-10 shrink-0 rounded-full bg-[#F2996E] px-5 text-sm font-medium text-white disabled:bg-stone-200"
                        >
                          确认导入
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {activeTab === "home" ? (
        <div className="shrink-0 bg-white/60 px-4 pb-[calc(4px+env(safe-area-inset-bottom))] pt-2">
          {/* Quick actions - subtle inline chips */}
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {[
              { label: "发提醒", action: () => triggerQuickAction("remind") },
              { label: "写纸条", action: () => triggerQuickAction("note") },
              { label: "看状态", action: () => triggerQuickAction("status") },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="shrink-0 rounded-full bg-orange-50 px-3 py-1.5 text-[12px] text-orange-700/80"
              >
                {item.label}
              </button>
            ))}
          </div>
          {/* Input row */}
          <div className="flex items-center gap-2 pb-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="突然想起什么..."
              rows={1}
              className="min-h-10 flex-1 resize-none rounded-2xl bg-white px-3.5 py-2.5 text-[14px] text-stone-700 outline-none"
            />
            <button
              type="button"
              disabled={isSubmitting || !input.trim()}
              onClick={() => handleAgentSubmit()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white transition-colors disabled:bg-stone-200"
              style={{ backgroundColor: isSubmitting || !input.trim() ? undefined : "#F2996E" }}
            >
              {isSubmitting ? "···" : "发送"}
            </button>
          </div>
          {/* Tab bar */}
          <div className="grid grid-cols-3 border-t border-black/5 pt-1.5">
            {TABS.map((tab) => {
              const isActive = navActiveTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-10 text-[12px] font-medium transition-colors ${
                    isActive
                      ? "text-[#F2996E]"
                      : "text-stone-400"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-5xl border-t border-black/5 bg-white/80 px-4 pb-[calc(4px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur sm:px-4">
          <div className="grid grid-cols-3">
            {TABS.map((tab) => {
              const isActive = navActiveTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-10 text-[12px] font-medium transition-colors ${
                    isActive ? "text-[#F2996E]" : "text-stone-400"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
