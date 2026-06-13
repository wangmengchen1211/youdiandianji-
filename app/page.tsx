"use client";

import { useEffect, useMemo, useState } from "react";

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
  "明早 8 点提醒爸爸测血糖，测完告诉我。",
  "今晚 8 点提醒妈妈吃降压药。",
  "把“你怎么又忘吃药了”说得温柔点。",
  "今天奶奶的任务完成了吗？",
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
  if (type === "medication") return `提醒${elderName}吃药，听到后说一声“知道了”。`;
  if (type === "health_measurement") return `提醒${elderName}测量并回传结果。`;
  if (type === "bring_items") return text.replace(/提醒/g, "").replace(elderName, elderName).replace(/[。！]/g, "");
  if (type === "call_back") return `提醒${elderName}给家属回个电话。`;
  return text.replace(/[。！]/g, "");
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

function buildCallScript(task: Task | null, elder: Elder | null) {
  const elderName = elder?.displayName ?? "您";
  if (!task) {
    return `${elderName}，我是家里小助理。孩子刚刚惦记你，想让我来问一声：你今天还好吗？你要是方便，就慢慢回我一句，我帮你带给孩子。`;
  }

  if (task.type === "medication") {
    return `${elderName}，我是家里小助理。孩子惦记你，托我来提醒一声：药记得按时吃。吃过了就回我一句，我也能让孩子放心一点。`;
  }

  if (task.type === "health_measurement") {
    return `${elderName}，我是家里小助理。孩子想着你呢，想问问你今天方不方便量一下。等你测好了，慢慢告诉我一声就行。`;
  }

  if (task.type === "call_back") {
    return `${elderName}，我是家里小助理。家里人在惦记你，方便的时候给孩子回个电话就好，不着急。`;
  }

  return `${elderName}，我是家里小助理。孩子想着你呢，想让我提醒你一声：${task.content}。你听到了或者忙完了，回我一句就好。`;
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
      createdAt: nowLabel(),
      updatedAt: nowLabel(),
      logs: [
        buildExecutionLog("已创建任务"),
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

