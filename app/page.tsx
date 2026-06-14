"use client";

import { useEffect, useMemo, useState } from "react";
import { VoiceCallModal } from "./components/VoiceCallModal";

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
  | "need_review";
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

type MemoryCategory = "about_user" | "about_elder" | "relationship" | "communication_style" | "pending_review";

type MemoryEntry = {
  id: string;
  category: MemoryCategory;
  content: string;
  source?: string;
  importance?: "high" | "medium" | "low";
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
  phase: "dialing" | "connected" | "ended" | "missed";
};

type AgentCallEntry = {
  role: "assistant" | "elder";
  text: string;
};

type AgentCareInsight = {
  factualSummary: string;
  relationshipInsight: string;
  suggestedAction: string;
  suggestedMessage: string;
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

type AgentCallState = {
  active: boolean;
  sessionId: string | null;
  phase: "idle" | "dialing" | "connected" | "ended";
  transcript: AgentCallEntry[];
  stage: string;
  taskSlots: Record<string, string>;
  careInsight: AgentCareInsight | null;
  isProcessing: boolean;
  finalizeResult: { summary: string; memoriesExtracted: number; careInsightId: string | null } | null;
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

const STORAGE_KEY = "you-dian-dian-ji-demo";
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "profile", label: "档案" },
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
      ? { user: "子女", assistant: "小助理" }
      : { user: "长辈", assistant: "小助理" };

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

  return `${scope}惦记了 ${targetTasks.length} 件事：已完成 ${completed} 件，已确认 ${confirmed} 件，待跟进 ${pending} 件${timeout ? `，暂未回应 ${timeout} 件` : "。"} `;
}

function buildAssistantPreview(profile: AssistantProfile, elderName: string) {
  const opening =
    profile.tone === "温柔陪伴" ? `${elderName}，今天怎么样？` : `${elderName}，我来看看你。`;
  const reminder =
    profile.rhythm === "简短清楚"
      ? "要紧的事我轻轻提醒你一声。"
      : "有要紧的事，我慢慢跟你说，不催你。";
  const followUp =
    profile.initiative === "少打扰"
      ? "你先忙，方便了再回我就行。"
      : profile.initiative === "多确认一次"
        ? "要是你一会儿顾不上，我晚点再来问你。"
        : "你想跟孩子说什么，也可以让我带句话。";

  return `${opening}${reminder}${followUp}`;
}

function buildCareReply(elderName: string) {
  return `${elderName}，不着急，听到了就回我一声。要是今天有什么想说的，也可以直接告诉我。`;
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

function buildCareQuestion(topic: CareTopic, elderName: string): string {
  const questions: Record<CareTopic, string> = {
    health: `${elderName}，最近身体感觉怎么样？有没有哪里不舒服？`,
    daily_life: `${elderName}，这两天都忙些什么呢？有没有出去走走？`,
    mood: `${elderName}，今天心情怎么样？有没有什么开心的事？`,
    weather: `${elderName}，最近天气变化大，您要注意加减衣服呀。`,
    food: `${elderName}，最近胃口怎么样？有没有好好吃饭？`,
    family_update: `${elderName}，家里最近都挺好的吧？有没有什么需要帮忙的？`,
  };
  return questions[topic];
}

function buildCallScript(task: Task | null, elder: Elder | null, relayMessage?: string) {
  const elderName = elder?.displayName ?? "您";

  // Build staged conversation: greeting → relay → care → task → closing
  const greeting = `${elderName}，晚上好呀。我是${elder?.relation ?? "家里"}那边的小助理，孩子今天有点惦记您，让我来问候一声。`;

  let relayPart = "";
  if (relayMessage) {
    const rewritten = rewriteRelayMessage(relayMessage, elderName);
    relayPart = rewritten;
  }

  let taskPart = "";
  if (task) {
    if (task.type === "medication") {
      taskPart = `对了，孩子托我提醒您一声：药记得按时吃。吃过了就跟我说一句，我也好让孩子放心。`;
    } else if (task.type === "health_measurement") {
      taskPart = `还有件事，孩子想问问您今天方不方便量一下身体。等您测好了，慢慢告诉我一声就行。`;
    } else if (task.type === "call_back") {
      taskPart = `孩子说方便的时候给您回个电话，您要是有空就接一下，不着急的。`;
    } else {
      taskPart = `孩子还让我提醒您：${task.content}。忙完了回我一句就好。`;
    }
  }

  const carePart = buildCareQuestion(pickCareTopic(Date.now() % 6), elderName);
  const closing = `您要是还有什么想跟孩子说的，也可以直接告诉我，我帮您带到。`;

  // Combine in natural order
  const parts = [greeting];
  if (relayPart) parts.push(relayPart);
  if (taskPart) parts.push(taskPart);
  parts.push(carePart);
  parts.push(closing);

  return parts.join(" ");
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
      phone: "13800000001",
      availableTime: "08:00-21:00",
      focus: ["吃药", "复诊"],
      communicationPreference: ["温柔一点", "简短一点"],
      responseHabit: "上午更容易接电话",
      nicknames: buildNicknames("妈妈", "妈妈"),
      recentResponseAt: "10 分钟前",
      oneLinePortrait: "总惦记你有没有好好吃饭",
      healthFocus: ["血压", "降压药", "睡眠"],
      recentSignals: ["最近提到有点头晕", "最近睡眠不太好"],
      personalityTraits: ["嘴上说不用管，但接到电话会开心", "喜欢先聊两句再说正事"],
      relationshipMemories: ["妈妈经常叮嘱你好好吃饭", "听说你加班会担心", "希望你有空回电话"],
    },
    {
      id: "elder_dad",
      relation: "爸爸",
      displayName: "爸爸",
      phone: "13800000002",
      availableTime: "08:00-21:00",
      focus: ["测血糖", "吃药"],
      communicationPreference: ["直接一点"],
      responseHabit: "晚上不太看消息",
      nicknames: buildNicknames("爸爸", "爸爸"),
      recentResponseAt: "昨天 20:10",
      oneLinePortrait: "不爱主动说累，总说自己没事",
      healthFocus: ["血糖", "饮食"],
      recentSignals: ["血糖控制得不错"],
      personalityTraits: ["不喜欢被催", "嘴硬心软"],
      relationshipMemories: ["爸爸嘴上不说，但你打电话他会开心很久"],
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
      detail: "回复：血糖 6.1。你可以放心一点了。",
      time: "2 分钟前",
      level: "success",
    },
    {
      id: uid("notice"),
      title: "妈妈暂时还没确认吃药提醒",
      detail: "我已经提醒了两次，你可以晚点亲自打个电话。",
      time: "10 分钟前",
      level: "warning",
    },
  ];

  const messages: Message[] = [
    {
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: "我会帮你把惦记整理成任务、回执和更温柔的话。你突然想起什么，直接告诉我就行。",
    },
  ];

  const elderMessages: Message[] = [
    {
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: "你好呀，我是家里小助理。孩子惦记你的时候，我会温和地提醒你，也会顺口问问你今天怎么样。你想说什么，都可以直接回我。",
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
    assistantMemories: [],
    memoryEntries: [
      { id: uid("mem"), category: "about_user", content: "最近项目上线，经常加班", importance: "medium", createdAt: nowLabel() },
      { id: uid("mem"), category: "about_user", content: "不太会直接表达关心", importance: "medium", createdAt: nowLabel() },
      { id: uid("mem"), category: "about_elder", content: "妈妈不喜欢一上来就被问身体", importance: "high", createdAt: nowLabel() },
      { id: uid("mem"), category: "about_elder", content: "晚上 8 点后比较愿意接电话", importance: "medium", createdAt: nowLabel() },
      { id: uid("mem"), category: "relationship", content: "妈妈总叮嘱你好好吃饭", importance: "high", createdAt: nowLabel() },
      { id: uid("mem"), category: "relationship", content: "她嘴上说不用管，其实盼你回电话", importance: "high", createdAt: nowLabel() },
      { id: uid("mem"), category: "communication_style", content: "转达时不要太肉麻", importance: "low", createdAt: nowLabel() },
      { id: uid("mem"), category: "communication_style", content: "用惦记比担心更合适", importance: "low", createdAt: nowLabel() },
      { id: uid("mem"), category: "pending_review", content: "妈妈最近可能睡眠不好", importance: "medium", createdAt: nowLabel() },
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
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [isPeopleDrawerOpen, setIsPeopleDrawerOpen] = useState(false);
  const [elders, setElders] = useState<Elder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [elderMessages, setElderMessages] = useState<Message[]>([]);
  const [assistantMemories, setAssistantMemories] = useState<AssistantMemory[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [currentElderId, setCurrentElderId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [elderDetailId, setElderDetailId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [newMemoryText, setNewMemoryText] = useState("");
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>("about_elder");
  const [taskCreateFlow, setTaskCreateFlow] = useState<TaskCreateFlow>({ step: "idle", rawText: "", targets: [], taskType: "other", remindLabel: "", repeatRule: "none", relayMessage: "", recommendedSlots: [] });
  const [callInsights, setCallInsights] = useState<CallInsight[]>([]);
  const [input, setInput] = useState("");
  const [elderInput, setElderInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [showAddElder, setShowAddElder] = useState(false);
  const [editingElderId, setEditingElderId] = useState<string | null>(null);
  const [assistantProfile, setAssistantProfile] = useState<AssistantProfile>(DEFAULT_ASSISTANT_PROFILE);
  const [callSession, setCallSession] = useState<CallSession>({
    open: false,
    audience: "child",
    taskId: null,
    phase: "dialing",
  });
  const [agentCall, setAgentCall] = useState<AgentCallState>({
    active: false,
    sessionId: null,
    phase: "idle",
    transcript: [],
    stage: "",
    taskSlots: {},
    careInsight: null,
    isProcessing: false,
    finalizeResult: null,
  });
  const [agentElderInput, setAgentElderInput] = useState("");
  const [schedulerResult, setSchedulerResult] = useState<string | null>(null);
  // Voice call modal state
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [voiceCallSessionId, setVoiceCallSessionId] = useState<string | null>(null);
  const [voiceCallInitialText, setVoiceCallInitialText] = useState("");
  const [elderForm, setElderForm] = useState<ElderFormState>({
    relation: "妈妈",
    displayName: "",
    phone: "",
    availableTime: "08:00-21:00",
    focus: ["吃药"],
    communicationPreference: ["温柔一点"],
    responseHabit: "",
  });

  useEffect(() => {
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
      if (parsed.memoryEntries) setMemoryEntries(parsed.memoryEntries);
      if (parsed.callInsights) setCallInsights(parsed.callInsights);
    }
    setHydrated(true);
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
      done: callSession.phase === "connected" || currentCallTask?.status === "reached" || currentCallTask?.status === "confirmed" || currentCallTask?.status === "completed",
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
        content: `好，我把${updatedDisplayName}的档案更新好了。`,
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
      content: `${elder.displayName}已经加入啦。以后没有特别说明时，我会默认先帮你照看 TA。`,
    });
    appendElderMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `你好呀，${elder.displayName}。我是家里小助理，以后提醒、电话和小纸条都会从我这里来。`,
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
      content: `我已经帮你排好了，到了 ${draft.remindLabel} 会先联系${draft.elderDisplayName}。${draft.relayMessage ? `你说的那句${draft.relayMessage}，我也会转告给TA的。` : ""}`,
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
      let event = "状态已更新";
      if (status === "reached") event = `${current.elderDisplayName}已接听，提醒已触达`;
      if (status === "confirmed") event = `${current.elderDisplayName}回复：知道了`;
      if (status === "completed") event = `${current.elderDisplayName}回复：${result ?? "做完了"}`;
      if (status === "need_review") event = `${current.elderDisplayName}有一条回复待查看`;
      if (status === "timeout") event = "两次提醒后仍未确认，已通知家属";

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
        detail: `${task.title} 已触达，接下来等待确认回执。`,
        level: "info",
      });
    }

    // ─── Step 4 & 5: Insight generation + warm receipt ───────────────
    if (status === "confirmed" || status === "completed") {
      const elder = elders.find((e) => e.id === task.elderId);
      const elderName = task.elderDisplayName;

      // Build warm receipt message (Step 5)
      const factualParts: string[] = [];
      if (status === "completed" && result) {
        factualParts.push(result);
      } else if (status === "confirmed") {
        factualParts.push("知道了，收到了");
      }
      if (task.relayMessage) {
        factualParts.push(`你托我传的那句话（${task.relayMessage}），我也转告给TA了`);
      }

      // Build relationship insight (Step 4)
      const traits = elder?.personalityTraits ?? [];
      const hasProudTrait = traits.some((t) => t.includes("嘴") || t.includes("不说") || t.includes("硬"));
      const relationshipInsight = hasProudTrait
        ? `${elderName}嘴上不说什么，但接到电话时语气是开心的。TA不太会主动表达想念，但每次你联系TA，TA都会高兴很久。`
        : `${elderName}今天聊得挺好的。TA听说你惦记TA，应该挺欣慰的。`;

      const suggestedAction = task.type === "medication"
        ? `${elderName}的药已经确认了，你可以放心。这两天如果有空，给TA回个电话比发消息更好。`
        : task.type === "health_measurement"
          ? `${elderName}的指标出来了，情况还不错。你可以安心忙你的，周末有空再联系TA。`
          : `${elderName}已经收到你的惦记了。如果你今晚有几分钟，给TA回个电话，TA会很高兴。`;

      const suggestedMessage = `刚听说你挺好的，我就放心了。最近有点忙，但一直惦记你。`;

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
      const warmReceipt = `${elderName}刚刚接了电话。${factualParts.length > 0 ? `TA说：${factualParts.join("，")}。` : ""}${relationshipInsight} ${suggestedAction}`;

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
          content: `你让小助理给${elderName}带了句话：${task.relayMessage}`,
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
        detail: "系统还没完全听懂，建议你点开任务详情看一下。",
        level: "review",
      });
    }
    if (status === "timeout") {
      addNotification({
        title: `${task.elderDisplayName}暂时还没回应`,
        detail: "我已经尝试两次提醒。你可以稍后亲自联系一下。",
        level: "warning",
      });

      // Proactive suggestion (Step 5)
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `${task.elderDisplayName}两次都没接到电话，可能有事在忙。你要是方便，直接给TA打个电话会更好。`,
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
      content: `这张小纸条我已经替你备好了：${version.text}`,
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
      phase: "dialing",
    });
  }

  function updateCallPhase(phase: CallSession["phase"]) {
    setCallSession((prev) => ({ ...prev, phase }));
    const task = tasks.find((item) => item.id === callSession.taskId) ?? latestElderTask;
    if (!task) return;

    if (phase === "connected") {
      applyTaskStatus(task, "reached");
      appendElderMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: `${task.elderDisplayName}，我是家里小助理。刚刚用电话提醒和你说一声：${task.content}`,
      });
      appendElderMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "text",
        content: buildCareReply(task.elderDisplayName),
      });
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

  function closeCall() {
    setCallSession((prev) => ({ ...prev, open: false, phase: "ended" }));
  }

  // ─── Voice Call Handler ────────────────────────────────────────────────
  async function startAgentCall() {
    // Open modal immediately with a connecting state
    setVoiceCallSessionId(null);
    setVoiceCallInitialText("");
    setVoiceCallOpen(true);

    try {
      // Fetch occurrences to find one we can call
      const occRes = await fetch("/api/task-occurrences");
      const occurrences = await occRes.json();

      // Find an occurrence that hasn't been called yet, or use the most recent one
      const callableOcc = Array.isArray(occurrences)
        ? occurrences.find((o: { status: string }) => o.status === "pending" || o.status === "in_progress") ?? occurrences[occurrences.length - 1]
        : null;

      if (!callableOcc) {
        // No occurrences - try triggering scheduler first
        const tickRes = await fetch("/api/scheduler/tick", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const tickData = await tickRes.json();
        if (tickData.triggered && tickData.triggered.length > 0) {
          const occId = tickData.triggered[0].callSessionId;
          const sessionRes = await fetch(`/api/calls/${occId}`);
          const sessionData = await sessionRes.json();
          const initialReply = sessionData.transcript?.[0]?.text ?? "你好呀，我是家里的小助理。";
          setVoiceCallSessionId(occId);
          setVoiceCallInitialText(initialReply);
          return;
        }
        // No tasks at all
        setVoiceCallOpen(false);
        setAgentCall({
          active: true,
          sessionId: null,
          phase: "ended",
          transcript: [{ role: "assistant", text: "当前没有可调度的任务实例，请先通过调度器Tick创建。" }],
          stage: "",
          taskSlots: {},
          careInsight: null,
          isProcessing: false,
          finalizeResult: null,
        });
        return;
      }

      // Start the call via API
      const startRes = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_occurrence_id: callableOcc.id }),
      });
      const startData = await startRes.json();

      if (!startRes.ok) {
        throw new Error(startData.error ?? "Failed to start call");
      }

      // Populate the modal with session data
      setVoiceCallSessionId(startData.call_session_id);
      setVoiceCallInitialText(startData.initial_reply ?? "你好呀，我是家里的小助理。");
    } catch (err) {
      setVoiceCallOpen(false);
      setAgentCall({
        active: true,
        sessionId: null,
        phase: "ended",
        transcript: [{ role: "assistant", text: `呼叫失败: ${err instanceof Error ? err.message : "未知错误"}` }],
        stage: "",
        taskSlots: {},
        careInsight: null,
        isProcessing: false,
        finalizeResult: null,
      });
    }
  }

  async function sendAgentTurn() {
    const trimmed = agentElderInput.trim();
    if (!trimmed || agentCall.isProcessing || !agentCall.sessionId) return;

    // Add elder message to transcript
    setAgentCall((prev) => ({
      ...prev,
      isProcessing: true,
      transcript: [...prev.transcript, { role: "elder" as const, text: trimmed }],
    }));
    setAgentElderInput("");

    try {
      const res = await fetch(`/api/calls/${agentCall.sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker: "elder", elder_input: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Turn failed");

      setAgentCall((prev) => ({
        ...prev,
        isProcessing: false,
        stage: data.stage ?? prev.stage,
        taskSlots: data.task_slots ?? prev.taskSlots,
        transcript: [
          ...prev.transcript,
          { role: "assistant" as const, text: data.assistant_reply ?? "..." },
        ],
      }));

      // Auto-finalize if call is ending
      if (data.is_call_ending) {
        setTimeout(() => finalizeAgentCall(), 800);
      }
    } catch (err) {
      setAgentCall((prev) => ({
        ...prev,
        isProcessing: false,
        transcript: [
          ...prev.transcript,
          { role: "assistant" as const, text: `处理失败: ${err instanceof Error ? err.message : "未知错误"}` },
        ],
      }));
    }
  }

  async function finalizeAgentCall() {
    if (!agentCall.sessionId) return;
    setAgentCall((prev) => ({ ...prev, isProcessing: true }));

    try {
      const res = await fetch(`/api/calls/${agentCall.sessionId}/finalize`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Finalize failed");

      // Fetch care insight
      let insight: AgentCareInsight | null = null;
      if (data.care_insight_id) {
        const insightRes = await fetch(`/api/care-insights`);
        const insights = await insightRes.json();
        const found = Array.isArray(insights)
          ? insights.find((i: { id: string }) => i.id === data.care_insight_id)
          : null;
        if (found) {
          insight = {
            factualSummary: found.factualSummary ?? "",
            relationshipInsight: found.relationshipInsight ?? "",
            suggestedAction: found.suggestedAction ?? "",
            suggestedMessage: found.suggestedMessage ?? "",
          };
        }
      }

      setAgentCall((prev) => ({
        ...prev,
        phase: "ended",
        isProcessing: false,
        careInsight: insight,
        finalizeResult: {
          summary: data.summary ?? "",
          memoriesExtracted: data.memories_extracted ?? 0,
          careInsightId: data.care_insight_id ?? null,
        },
      }));
    } catch (err) {
      setAgentCall((prev) => ({
        ...prev,
        phase: "ended",
        isProcessing: false,
        transcript: [
          ...prev.transcript,
          { role: "assistant" as const, text: `结算失败: ${err instanceof Error ? err.message : "未知错误"}` },
        ],
      }));
    }
  }

  function closeAgentCall() {
    setAgentCall({
      active: false,
      sessionId: null,
      phase: "idle",
      transcript: [],
      stage: "",
      taskSlots: {},
      careInsight: null,
      isProcessing: false,
      finalizeResult: null,
    });
    setAgentElderInput("");
  }

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

  function handleElderSubmit(text = elderInput) {
    const trimmed = text.trim();
    if (!trimmed) return;

    appendElderMessage({
      id: uid("msg"),
      role: "user",
      kind: "text",
      content: trimmed,
    });
    setElderInput("");

    if (latestElderTask) {
      if (trimmed.includes("做完") || trimmed.includes("好了") || trimmed.includes("挺好的")) {
        applyTaskStatus(latestElderTask, "completed", trimmed);
      } else if (trimmed.includes("知道") || trimmed.includes("收到")) {
        applyTaskStatus(latestElderTask, "confirmed", trimmed);
      } else {
        applyTaskStatus(latestElderTask, "need_review", trimmed);
      }
    }

    appendElderMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content:
        trimmed.includes("挺好") || trimmed.includes("做完") || trimmed.includes("知道")
          ? "我收到啦，你这边的情况我会好好告诉孩子，让 TA 放心一点。"
          : "我收到啦，我会把这句话带给孩子。你要是还想说点别的，也可以继续告诉我。",
    });
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
        content: `没问题，我已经把“添加长辈”表单打开了。你补一下 ${hintedRelation} 的联系方式，我就能开始帮你记挂。`,
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
          content: "这句话我可以帮你改得更柔和一些。你想发给哪位长辈？",
        });
        return;
      }
      const noteVersions = buildNoteVersions(trimmed, target.displayName);
      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "note",
        content: "这句话有点着急，我帮你换成更温和的说法。",
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
      content: "我目前最擅长 3 件事：创建提醒、查回执、把话改得更温柔。你可以直接对我说一句完整的话试试。",
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
        content: "你想提醒哪位长辈？跟我说一下称呼就行。",
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
        content: `好，我先帮你整理一下。这是一个${repeatRule === "daily" ? "每日" : ""}电话提醒。${slotHint}`,
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
      content: `好的，${remindLabel}给${targets[0].displayName}打电话。要不要顺便帮你带句话？比如告诉TA你最近有点忙，但一直惦记着。`,
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
        content: "没太听明白时间，你直接说个大概就行，比如：晚饭后 8 点、早上 9 点。",
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
      content: `好的，${parsedTime}给${flow.targets[0].displayName}打电话。要不要顺便帮你带句话？比如告诉TA你最近有点忙，但一直惦记着。`,
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
      content: "我帮你整理好了，确认一下就可以。",
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
          <div className="mb-6">
            <p className="text-sm font-medium text-orange-500">突然有点惦记你们</p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-800">先选择你的身份</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              子女端负责发起惦记和查看回执；长辈端只保留家里小助理聊天、电话提醒和反馈。
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setUserMode("child")}
              className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-sm font-medium text-white"
            >
              我是子女
            </button>
            <button
              type="button"
              onClick={() => setUserMode("elder")}
              className="min-h-12 w-full rounded-2xl bg-[#FFF1C7] px-4 py-3 text-sm font-medium text-stone-700"
            >
              我是长辈
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (elders.length === 0 && userMode === "elder") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <div className="rounded-[28px] border border-orange-100 bg-white p-6 shadow-[0_20px_60px_rgba(242,153,110,0.15)]">
          <p className="text-sm font-medium text-orange-500">家里小助理</p>
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
              onClick={() => setUserMode("child")}
              className="min-h-12 w-full rounded-2xl bg-[#FFF1C7] px-4 py-3 text-sm font-medium text-stone-700"
            >
              切换到子女端
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

  const navActiveTab: "home" | "tasks" | "profile" | "notifications" =
    activeTab === "assistant" ? "home" : activeTab;

  if (userMode === "elder") {
    return (
      <main className="mx-auto min-h-screen max-w-md px-0 text-stone-800">
        {callSession.open && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-950 p-6 text-white">
            <p className="text-center text-xs text-stone-400">来电中</p>
            <p className="mt-1 text-center text-lg font-semibold text-stone-200">小助理</p>
            <p className="mt-1 text-center text-sm text-stone-400">
              {callSession.phase === "dialing" && "正在问候..."}
              {callSession.phase === "connected" && "通话中"}
              {callSession.phase === "missed" && "未接通"}
              {callSession.phase === "ended" && "通话结束"}
            </p>

            <div className="mt-8 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-4xl font-bold shadow-[0_0_40px_rgba(249,115,22,0.4)]">
              助
            </div>

            <div className="mt-6 flex items-end justify-center gap-1.5">
              {[20, 36, 16, 40, 24, 32, 14, 28].map((height, index) => (
                <span
                  key={index}
                  className="w-1.5 rounded-full bg-orange-400/70 transition-all"
                  style={{
                    height: callSession.phase === "connected" || callSession.phase === "dialing" ? height : 8,
                    animation: callSession.phase === "connected" || callSession.phase === "dialing" ? `pulse ${0.5 + index * 0.08}s ease-in-out infinite alternate` : "none",
                  }}
                />
              ))}
            </div>

            <div className="mt-6 w-full max-w-xs rounded-[24px] bg-white/5 p-4 text-sm leading-7 text-stone-200">
              {callSession.phase === "dialing" && "正在接通，请稍等..."}
              {(callSession.phase === "connected" || callSession.phase === "ended") && (
                buildCallScript(currentCallTask, currentElder, currentCallTask?.relayMessage)
              )}
              {callSession.phase === "missed" && "暂时没人接听，稍后再试。"}
            </div>

            {callSession.phase === "dialing" && (
              <div className="mt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => updateCallPhase("connected")}
                  className="min-h-14 min-w-28 rounded-full bg-emerald-500 px-6 text-base font-medium shadow-lg"
                >
                  接听
                </button>
                <button
                  type="button"
                  onClick={() => updateCallPhase("missed")}
                  className="min-h-14 min-w-28 rounded-full bg-rose-600 px-6 text-base font-medium shadow-lg"
                >
                  拒接
                </button>
              </div>
            )}

            {(callSession.phase === "connected" || callSession.phase === "ended") && (
              <div className="mt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (currentCallTask) applyTaskStatus(currentCallTask, "confirmed", "我知道了");
                    closeCall();
                  }}
                  className="min-h-12 rounded-full bg-white/10 px-6 text-sm font-medium"
                >
                  我知道了
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentCallTask) applyTaskStatus(currentCallTask, "completed", "好的，我说完了");
                    closeCall();
                  }}
                  className="min-h-12 rounded-full bg-white/10 px-6 text-sm font-medium"
                >
                  我说完了
                </button>
                <button
                  type="button"
                  onClick={closeCall}
                  className="min-h-12 rounded-full bg-rose-600 px-6 text-sm font-medium"
                >
                  挂断
                </button>
              </div>
            )}

            {callSession.phase === "missed" && (
              <button
                type="button"
                onClick={closeCall}
                className="mt-6 min-h-12 rounded-full bg-white/10 px-8 text-sm font-medium"
              >
                关闭
              </button>
            )}
          </div>
        )}

        <VoiceCallModal
          open={voiceCallOpen}
          elderName={currentElder?.displayName ?? "长辈"}
          callSessionId={voiceCallSessionId}
          initialText={voiceCallInitialText}
          onClose={() => {
            setVoiceCallOpen(false);
            setVoiceCallSessionId(null);
            setVoiceCallInitialText("");
          }}
        />

        <section className="flex min-h-screen flex-col bg-[#FFF8F3]">
          <div className="border-b border-orange-100 bg-[linear-gradient(180deg,#FFF7EE_0%,#FFFDF9_100%)] px-4 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-stone-800">家里小助理</p>
                <p className="mt-1 text-[15px] text-stone-700">{currentElder?.displayName ?? "妈妈"}，你好呀</p>
                <p className="mt-1 text-[13px] text-orange-500/80">有事我会直接告诉你。</p>
              </div>
              <button
                type="button"
                onClick={() => setUserMode("child")}
                className="min-h-12 rounded-full bg-orange-50 px-4 py-2 text-xs text-stone-600"
              >
                子女端
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-3">
              {elderMessages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-[20px] px-4 py-3 text-[15px] leading-7 shadow-sm ${
                      message.role === "user"
                        ? "bg-[#F2996E] text-white shadow-[0_10px_24px_rgba(242,153,110,0.22)]"
                        : "border border-orange-100 bg-[#FFFDFB] text-stone-700"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-orange-100 bg-[linear-gradient(180deg,#FFFDF9_0%,#FFF5EA_100%)] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => openCall(latestElderTask, "elder")}
                className="min-h-10 shrink-0 rounded-full border border-orange-100 bg-[#FFF1C7] px-4 text-sm text-stone-700"
              >
                电话提醒
              </button>
              <button
                type="button"
                onClick={startAgentCall}
                className="min-h-10 shrink-0 rounded-full bg-[#F2996E] px-4 text-sm font-medium text-white"
              >
                模拟语音电话
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
                className="min-h-10 shrink-0 rounded-full border border-orange-100 bg-white px-4 text-sm text-stone-700"
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
                className="min-h-10 shrink-0 rounded-full border border-orange-100 bg-white px-4 text-sm text-stone-700"
              >
                看小纸条
              </button>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {ELDER_QUICK_INPUTS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setElderInput(sample)}
                  className="min-h-10 shrink-0 rounded-full bg-orange-50 px-4 text-sm text-stone-600"
                >
                  {sample}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                value={elderInput}
                onChange={(event) => setElderInput(event.target.value)}
                placeholder="直接回复我..."
                className="min-h-12 flex-1 resize-none rounded-[24px] border border-orange-100 bg-[#FFFDFB] px-4 py-3 text-[15px] text-stone-700 outline-none"
              />
              <button
                type="button"
                onClick={() => handleElderSubmit()}
                className="min-h-12 shrink-0 rounded-full bg-[#F2996E] px-5 py-2 text-sm font-medium text-white"
              >
                发送
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`mx-auto max-w-5xl px-3 py-4 text-stone-800 sm:px-4 sm:py-6 ${
        activeTab === "home" ? "h-[100svh] overflow-hidden" : "min-h-screen"
      }`}
    >
      {callSession.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(78,52,39,0.18)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[36px] border border-orange-100 bg-[linear-gradient(180deg,#FFF9F3_0%,#FFF3E7_100%)] p-6 shadow-[0_24px_60px_rgba(145,94,61,0.2)]">
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[linear-gradient(180deg,#F6B58C_0%,#F2996E_100%)] text-2xl font-semibold text-white shadow-[0_14px_30px_rgba(242,153,110,0.3)]">
                助
              </div>
              <p className="mt-4 text-xs font-medium tracking-[0.14em] text-orange-500">
                {callSession.phase === "dialing" && "正在给"}
                {callSession.phase === "connected" && "已接通"}
                {callSession.phase === "missed" && "未接通"}
                {callSession.phase === "ended" && "通话结束"}
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-800">{currentElder?.displayName ?? "长辈"}</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {callSession.phase === "dialing" && "正在拨打电话，请稍等..."}
                {callSession.phase === "connected" && "已接听，正在通话中..."}
                {callSession.phase === "missed" && "暂时没人接听，稍后会再试一次"}
                {callSession.phase === "ended" && `${currentCallTask?.title ?? "问候"}已完成`}
              </p>
              {(callSession.phase === "connected" || callSession.phase === "ended") && (
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
      {agentCall.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm">
          <div className="flex h-[90vh] w-full max-w-lg flex-col rounded-[36px] border border-orange-100 bg-[linear-gradient(180deg,#FFF9F3_0%,#FFF3E7_100%)] p-4 shadow-2xl">
            {/* Header */}
            <div className="rounded-[28px] border border-orange-100/80 bg-white/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-orange-500">
                    {agentCall.phase === "dialing" && "🤖 Agent 正在呼叫..."}
                    {agentCall.phase === "connected" && "🟢 Agent 通话中"}
                    {agentCall.phase === "ended" && "✅ 通话已结束"}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-stone-800">{currentElder?.displayName ?? "长辈"}</p>
                  {agentCall.stage && (
                    <p className="mt-1 text-xs text-stone-500">
                      当前阶段: <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-600">{agentCall.stage}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeAgentCall}
                  className="min-h-8 rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600"
                >
                  关闭
                </button>
              </div>
            </div>

            {/* Transcript */}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-orange-100 bg-white/80 p-3">
              <div className="space-y-2">
                {agentCall.transcript.map((entry, idx) => (
                  <div key={idx} className={`flex ${entry.role === "elder" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-[18px] px-3 py-2 text-sm leading-6 ${
                        entry.role === "elder"
                          ? "bg-[#F2996E] text-white"
                          : "border border-orange-100 bg-[#FFFDFB] text-stone-700"
                      }`}
                    >
                      <p className="mb-1 text-[10px] opacity-60">{entry.role === "elder" ? "👵 长辈" : "🤖 小助理"}</p>
                      {entry.text}
                    </div>
                  </div>
                ))}
                {agentCall.isProcessing && (
                  <div className="flex justify-start">
                    <div className="rounded-[18px] border border-orange-100 bg-[#FFFDFB] px-3 py-2 text-sm text-stone-400">
                      Agent 思考中...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input area (when connected) */}
            {agentCall.phase === "connected" && (
              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={agentElderInput}
                  onChange={(e) => setAgentElderInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentTurn(); } }}
                  placeholder="模拟老人说话... (Enter 发送)"
                  rows={2}
                  className="min-h-12 flex-1 resize-none rounded-[20px] border border-orange-100 bg-white px-3 py-2 text-sm text-stone-700 outline-none"
                />
                <button
                  type="button"
                  disabled={agentCall.isProcessing}
                  onClick={sendAgentTurn}
                  className="min-h-12 shrink-0 rounded-full bg-[#F2996E] px-4 py-2 text-sm font-medium text-white disabled:bg-orange-200"
                >
                  发送
                </button>
                <button
                  type="button"
                  disabled={agentCall.isProcessing}
                  onClick={finalizeAgentCall}
                  className="min-h-12 shrink-0 rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  结束
                </button>
              </div>
            )}

            {/* Care Insight Card (when ended) */}
            {agentCall.phase === "ended" && agentCall.careInsight && (
              <div className="mt-3 overflow-y-auto rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-3 text-xs font-semibold tracking-wide text-emerald-700">💡 子女端洞察</p>
                <div className="space-y-2 text-sm text-stone-700">
                  <div>
                    <p className="text-xs font-medium text-stone-500">事实摘要</p>
                    <p>{agentCall.careInsight.factualSummary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-stone-500">关系洞察</p>
                    <p>{agentCall.careInsight.relationshipInsight}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-stone-500">建议行动</p>
                    <p>{agentCall.careInsight.suggestedAction}</p>
                  </div>
                  {agentCall.careInsight.suggestedMessage && (
                    <div>
                      <p className="text-xs font-medium text-stone-500">可发送消息</p>
                      <div className="mt-1 rounded-xl bg-white p-2 text-sm text-stone-600">
                        {agentCall.careInsight.suggestedMessage}
                      </div>
                    </div>
                  )}
                </div>
                {agentCall.finalizeResult && (
                  <p className="mt-3 text-xs text-stone-400">
                    提取记忆: {agentCall.finalizeResult.memoriesExtracted} 条
                  </p>
                )}
              </div>
            )}

            {/* Finalize result (when ended, no insight) */}
            {agentCall.phase === "ended" && !agentCall.careInsight && agentCall.finalizeResult && (
              <div className="mt-3 rounded-[24px] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
                <p>{agentCall.finalizeResult.summary || "通话已结束，未生成洞察。"}</p>
                <p className="mt-1 text-xs text-stone-400">提取记忆: {agentCall.finalizeResult.memoriesExtracted} 条</p>
              </div>
            )}
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

      <section className={activeTab === "home" ? "flex h-full flex-col overflow-hidden pb-[172px]" : "space-y-3 pb-24"}>
        {activeTab === "home" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#E5D4C6] bg-[#F6EEE6] shadow-[0_20px_48px_rgba(145,94,61,0.10)]">
            <div className="border-b border-[#E5D4C6] bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF6EE_100%)] px-4 py-4 shadow-[0_8px_20px_rgba(145,94,61,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[17px] font-semibold text-stone-800">家里小助理</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("assistant")}
                      className="min-h-8 rounded-full border border-orange-100 bg-white px-3 text-[11px] font-medium text-orange-600"
                    >
                      记忆库
                    </button>
                  </div>
                  <p className="mt-1 text-[15px] text-stone-700">想到什么就说，我来帮你整理。</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-[13px] text-orange-500/80">
                      当前长辈：{currentElder?.relation ?? currentElder?.displayName ?? "未选择"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsPeopleDrawerOpen(true)}
                      className="min-h-8 rounded-full border border-orange-100 bg-white px-3 text-[11px] font-medium text-stone-600"
                    >
                      切换长辈
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUserMode("elder")}
                  className="min-h-12 shrink-0 rounded-full bg-orange-50 px-4 py-2 text-xs text-stone-600"
                >
                  长辈端
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7EFE7] px-3 pb-[188px]">
              <div className="space-y-3">
                <div
                  className={`sticky top-0 z-10 -mx-1 rounded-[18px] border border-[#E8D8C8] bg-[#FFF8EF]/96 px-4 shadow-[0_10px_20px_rgba(145,94,61,0.08)] backdrop-blur ${
                    isSummaryExpanded ? "py-3" : "py-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-orange-500">今日跟进</p>
                    <button
                      type="button"
                      onClick={() => setIsSummaryExpanded((prev) => !prev)}
                      className="min-h-8 rounded-full bg-white/80 px-3 text-[11px] font-medium text-stone-600"
                    >
                      {isSummaryExpanded ? "收起" : "展开"}
                    </button>
                  </div>
                  {isSummaryExpanded && <p className="mt-1 text-sm leading-6 text-stone-700">{currentSummary}</p>}
                </div>

                {/* Proactive care suggestions (Step 5) */}
                {proactiveSuggestions.length > 0 && (
                  <div className="space-y-2">
                    {proactiveSuggestions.map((sug, i) => (
                      <div key={`proactive-${i}`} className="flex justify-start">
                        <div className="max-w-[88%] rounded-[18px] border border-[#D9E8DB] bg-[#F6FBF7] px-4 py-3 shadow-sm">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-500/70">惦记一下</p>
                          <p className="mt-1.5 text-[15px] leading-7 text-stone-700">{sug.text}</p>
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
                              className="mt-2 min-h-10 rounded-full bg-[#F2996E] px-4 py-1.5 text-xs font-medium text-white"
                            >
                              {sug.action}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className="relative max-w-[88%]">
                      <span
                        aria-hidden="true"
                        className={`absolute top-4 h-3 w-3 rotate-45 border-b border-r border-[#E2D1C3] bg-[#FFFDFC] ${
                          message.role === "user" ? "-right-1.5" : "-left-1.5"
                        }`}
                      />
                      <div className="relative rounded-[18px] border border-[#E2D1C3] bg-[#FFFDFC] px-4 py-3 text-[15px] leading-7 text-stone-700 shadow-[0_4px_12px_rgba(145,94,61,0.05)]">
                      <p>{message.content}</p>
                      {message.kind === "taskDraft" && message.drafts && (
                        <div className="mt-3 space-y-3">
                          {message.drafts.map((draft) => (
                            <div key={draft.id} className="rounded-2xl border border-[#F0D9BF] bg-[#FFF4E8] p-4">
                              <p className="font-semibold text-stone-800">{draft.title}</p>
                              <div className="mt-3 space-y-1.5 text-sm text-stone-600">
                                <div className="flex gap-2">
                                  <span className="text-stone-400">对象</span>
                                  <span>{draft.elderDisplayName}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-stone-400">时间</span>
                                  <span>{draft.remindLabel}</span>
                                  {draft.repeatRule === "daily" && <span className="text-xs text-orange-400">每日</span>}
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-stone-400">方式</span>
                                  <span>{draft.channel}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-stone-400">提醒</span>
                                  <span>{draft.content}</span>
                                </div>
                                {draft.relayMessage && (
                                  <div className="flex gap-2">
                                    <span className="text-stone-400">传话</span>
                                    <span className="text-orange-600">{draft.relayMessage}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={draft.created}
                                  onClick={() => createTaskFromDraft(draft)}
                                  className={`min-h-12 rounded-full px-4 py-2 text-xs font-medium ${draft.created ? "bg-stone-100 text-stone-400" : "bg-[#F2996E] text-white"}`}
                                >
                                  {draft.created ? "已创建" : "确认创建"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.kind === "note" && message.noteVersions && (
                        <div className="mt-3 space-y-3">
                          {message.noteVersions.map((version) => (
                            <div key={version.style} className="rounded-2xl border border-[#F0D9BF] bg-[#FFF4E8] p-4">
                              <p className="text-xs text-stone-500">{version.style}</p>
                              <p className="mt-2 text-sm text-stone-700">{version.text}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => sendNote(version)}
                                  className="min-h-12 rounded-full bg-white px-3 py-2 text-xs text-stone-700"
                                >
                                  发送给{currentElder?.displayName ?? "长辈"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.role === "assistant" && message.kind === "text" && message.id === messages[0]?.id && (
                        <div className="mt-3 space-y-2">
                          <p className="text-[12px] leading-5 text-stone-400">你也可以这样说</p>
                          <div className="flex flex-wrap gap-2">
                            {QUICK_INPUTS.map((sample) => (
                              <button
                                key={sample}
                                type="button"
                                onClick={() => setInput(sample)}
                                className="rounded-full bg-transparent px-0 text-left text-[12px] leading-5 text-stone-500"
                              >
                                {sample}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  </div>
                ))}
                {isSubmitting && (
                  <div className="flex justify-start">
                    <div className="relative max-w-[88%]">
                      <span aria-hidden="true" className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 border-b border-r border-[#E2D1C3] bg-[#FFFDFC]" />
                      <div className="rounded-[18px] border border-[#E2D1C3] bg-[#FFFDFC] px-4 py-3 text-[15px] leading-7 text-stone-700 shadow-[0_4px_12px_rgba(145,94,61,0.05)]">
                        正在帮你想一想...
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
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
                        onClick={startAgentCall}
                        className="min-h-10 rounded-full bg-[#F2996E] px-4 py-2 text-xs font-medium text-white"
                      >
                        语音通话
                      </button>
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
            {/* Elder detail view */}
            {elderDetailId ? (
              (() => {
                const detailElder = elders.find((e) => e.id === elderDetailId);
                if (!detailElder) return null;
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
        
                    {/* Health section */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">身体状况</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(detailElder.healthFocus ?? detailElder.focus).map((item) => (
                          <span key={item} className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-600">{item}</span>
                        ))}
                      </div>
                      {detailElder.recentSignals && detailElder.recentSignals.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {detailElder.recentSignals.map((sig, i) => (
                            <p key={i} className="text-xs text-stone-500">{sig}</p>
                          ))}
                        </div>
                      )}
                    </div>
        
                    {/* Personality section */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">性格与沟通偏好</p>
                      <div className="mt-2 space-y-1">
                        {(detailElder.personalityTraits ?? []).map((trait, i) => (
                          <p key={i} className="text-sm text-stone-600">{trait}</p>
                        ))}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {detailElder.communicationPreference.map((pref) => (
                            <span key={pref} className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-600">{pref}</span>
                          ))}
                        </div>
                      </div>
                    </div>
        
                    {/* Relationship memories */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">和你的核心记忆</p>
                      <div className="mt-2 space-y-2">
                        {(detailElder.relationshipMemories ?? []).map((mem, i) => (
                          <div key={i} className="flex gap-2 text-sm text-stone-600">
                            <span className="text-orange-400">-</span>
                            <span>{mem}</span>
                          </div>
                        ))}
                      </div>
                    </div>
        
                    {/* Basic info */}
                    <div className="rounded-[24px] border border-orange-100 bg-white p-4">
                      <p className="text-sm font-semibold text-stone-700">基础信息</p>
                      <div className="mt-2 space-y-1 text-sm text-stone-600">
                        <p>关系：{detailElder.relation}</p>
                        <p>电话：{detailElder.phone}</p>
                        <p>方便时间：{detailElder.availableTime}</p>
                        <p>回应习惯：{detailElder.responseHabit || "待补充"}</p>
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
          <div className="space-y-4 pb-24">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">小助理记忆库</h2>
                <p className="mt-1 text-sm text-stone-500">小助理会记住这些，用于更好的电话和对话</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("home")}
                className="min-h-10 rounded-full bg-orange-50 px-4 py-2 text-xs text-stone-700"
              >
                返回
              </button>
            </div>

            {/* Call insights (Step 4) */}
            {callInsights.length > 0 && (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-sm font-semibold text-emerald-700">亲情洞察</p>
                <p className="mt-1 text-xs text-emerald-600/70">每次通话后自动生成，帮你更好地理解长辈</p>
                <div className="mt-3 space-y-3">
                  {callInsights.slice(0, 5).map((insight) => (
                    <div key={insight.id} className="rounded-2xl border border-emerald-100 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-stone-700">{insight.elderDisplayName}</p>
                        <span className="text-xs text-stone-400">{insight.createdAt}</span>
                      </div>
                      {insight.factualSummary && (
                        <p className="mt-2 text-sm text-stone-600">{insight.factualSummary}</p>
                      )}
                      <p className="mt-2 text-sm text-stone-500">{insight.relationshipInsight}</p>
                      <div className="mt-2 rounded-xl bg-orange-50 px-3 py-2">
                        <p className="text-xs text-orange-600">{insight.suggestedAction}</p>
                      </div>
                      {insight.suggestedMessage && (
                        <div className="mt-2 flex items-center gap-2">
                          <p className="flex-1 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">{insight.suggestedMessage}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setInput(insight.suggestedMessage);
                              setActiveTab("home");
                            }}
                            className="shrink-0 rounded-full bg-[#F2996E] px-3 py-1.5 text-xs font-medium text-white"
                          >
                            用这句
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Memory categories */}
            {([
              { key: "about_user" as const, label: "关于你" },
              { key: "about_elder" as const, label: "关于长辈" },
              { key: "relationship" as const, label: "关于你们的关系" },
              { key: "communication_style" as const, label: "沟通风格" },
              { key: "pending_review" as const, label: "待确认记忆" },
            ]).map((cat) => {
              const entries = memoryEntries.filter((m) => m.category === cat.key);
              if (entries.length === 0) return null;
              return (
                <div key={cat.key} className="rounded-[24px] border border-orange-100 bg-white p-4 shadow-[0_8px_24px_rgba(242,153,110,0.08)]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-stone-700">{cat.label}</p>
                    {cat.key === "pending_review" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{entries.length} 条待确认</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {entries.map((mem) => (
                      <div key={mem.id} className="flex items-start justify-between gap-2 rounded-xl bg-stone-50/70 px-3 py-2">
                        <div className="flex-1">
                          <p className="text-sm text-stone-600">{mem.content}</p>
                          {mem.importance === "high" && (
                            <p className="mt-0.5 text-xs text-orange-400">重要</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {cat.key === "pending_review" && (
                            <button
                              type="button"
                              onClick={() => {
                                setMemoryEntries((prev) => prev.map((m) => m.id === mem.id ? { ...m, category: "about_elder" } : m));
                              }}
                              className="rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-700"
                            >
                              确认
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setMemoryEntries((prev) => prev.filter((m) => m.id !== mem.id))}
                            className="rounded-lg bg-stone-200 px-2 py-1 text-xs text-stone-500"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Add memory */}
            <div className="rounded-[24px] border border-orange-100 bg-white p-4">
              <p className="text-sm font-semibold text-stone-700">手动添加记忆</p>
              <textarea
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder="比如：妈妈不喜欢别人说她身体不好"
                className="mt-2 min-h-16 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm outline-none"
              />
              <div className="mt-2 flex gap-2">
                <select
                  value={newMemoryCategory}
                  onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
                  className="min-h-10 rounded-full border border-orange-100 bg-orange-50/60 px-3 text-sm"
                >
                  <option value="about_user">关于你</option>
                  <option value="about_elder">关于长辈</option>
                  <option value="relationship">关系记忆</option>
                  <option value="communication_style">沟通风格</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const text = newMemoryText.trim();
                    if (!text) return;
                    setMemoryEntries((prev) => [...prev, {
                      id: uid("mem"),
                      category: newMemoryCategory,
                      content: text,
                      source: "user_manual_input",
                      importance: "medium",
                      createdAt: nowLabel(),
                    }]);
                    setNewMemoryText("");
                  }}
                  className="min-h-10 flex-1 rounded-full bg-[#F2996E] px-4 text-sm font-medium text-white"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {activeTab === "home" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-5xl px-3 sm:px-4">
          <div className="overflow-hidden rounded-[26px] border border-[#E2D1C3] bg-white shadow-[0_18px_40px_rgba(145,94,61,0.14)]">
            <div className="bg-[linear-gradient(180deg,#FFF8F1_0%,#FFF1E5_100%)] px-3 pb-2 pt-3">
              <div className="mb-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => triggerQuickAction("remind")}
                  className="min-h-11 rounded-[18px] border border-[#E2D1C3] bg-white text-xs font-medium text-stone-700"
                >
                  发个提醒
                </button>
                <button
                  type="button"
                  onClick={() => triggerQuickAction("note")}
                  className="min-h-11 rounded-[18px] border border-[#E2D1C3] bg-white text-xs font-medium text-stone-700"
                >
                  写小纸条
                </button>
                <button
                  type="button"
                  onClick={() => triggerQuickAction("status")}
                  className="min-h-11 rounded-[18px] border border-[#E2D1C3] bg-white text-xs font-medium text-stone-700"
                >
                  看长辈状态
                </button>
              </div>
              <div className="flex items-end gap-2 rounded-[22px] border border-[#E2D1C3] bg-[#FFF9F4] px-3 py-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="突然想起什么，就告诉我..."
                  className="min-h-12 flex-1 resize-none rounded-[22px] border border-[#E2D1C3] bg-white px-4 py-3 text-[15px] text-stone-700 outline-none"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleAgentSubmit()}
                  className={`min-h-12 shrink-0 rounded-full px-5 py-2 text-sm font-medium text-white ${isSubmitting ? "bg-orange-200" : "bg-[#F2996E]"}`}
                >
                  {isSubmitting ? "思考中" : "发送"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-[#E2D1C3] bg-white/98 p-2 pb-[calc(4px+env(safe-area-inset-bottom))]">
              {TABS.map((tab) => (
                (() => {
                  const isActive = navActiveTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`rounded-[18px] px-2 text-xs font-medium ${
                        isActive
                          ? tab.key === "home"
                            ? "min-h-12 bg-[#F2996E] text-white"
                            : "min-h-12 bg-orange-50 text-stone-800"
                          : tab.key === "home"
                            ? "min-h-12 bg-orange-50 text-stone-700"
                            : "min-h-12 bg-transparent text-stone-500"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })()
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-5xl px-3 pb-[calc(4px+env(safe-area-inset-bottom))] pt-0 sm:px-4">
          <div className="grid grid-cols-3 gap-2 rounded-[26px] border border-orange-100 bg-white/95 p-2 shadow-[0_18px_40px_rgba(242,153,110,0.18)] backdrop-blur">
            {TABS.map((tab) => (
              (() => {
                const isActive = navActiveTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-[18px] px-2 text-xs font-medium ${
                      isActive
                        ? tab.key === "home"
                          ? "min-h-12 bg-[#F2996E] text-white"
                          : "min-h-12 bg-orange-50 text-stone-800"
                        : tab.key === "home"
                          ? "min-h-12 bg-orange-50 text-stone-700"
                          : "min-h-12 bg-transparent text-stone-500"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })()
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
