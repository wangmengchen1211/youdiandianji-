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

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [userMode, setUserMode] = useState<UserMode | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [lastPrimaryTab, setLastPrimaryTab] = useState<TabKey>("home");
  const [isPeopleDrawerOpen, setIsPeopleDrawerOpen] = useState(false);
  const [elders, setElders] = useState<Elder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [elderMessages, setElderMessages] = useState<Message[]>([]);
  const [assistantMemories, setAssistantMemories] = useState<AssistantMemory[]>([]);
  const [currentElderId, setCurrentElderId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [hydrated, userMode, elders, tasks, notifications, messages, elderMessages, currentElderId, assistantProfile, assistantMemories]);

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

  useEffect(() => {
    if (activeTab === "home" || activeTab === "tasks" || activeTab === "profile") {
      setLastPrimaryTab(activeTab);
    }
  }, [activeTab]);

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
      createdAt: nowLabel(),
      updatedAt: nowLabel(),
      logs: [buildExecutionLog("已创建任务"), buildExecutionLog("已进入待提醒队列")],
    };

    setTasks((prev) => [nextTask, ...prev]);
    setSelectedTaskId(nextTask.id);
    setActiveTab("tasks");
    markDraftCreated(draft.id);
    addNotification({
      title: `${draft.elderDisplayName}的提醒已创建`,
      detail: `${draft.remindLabel}会通过${draft.channel}触达，回执状态会继续同步给你。`,
      level: "info",
    });
    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: `我已经帮你排好了，到了 ${draft.remindLabel} 会先联系${draft.elderDisplayName}。`,
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
    if (status === "confirmed") {
      addNotification({
        title: `${task.elderDisplayName}说知道了`,
        detail: `${task.title} 已确认收到。你可以先放心一点。`,
        level: "success",
      });
    }
    if (status === "completed") {
      addNotification({
        title: `${task.elderDisplayName}已完成`,
        detail: result ? `回复：${result}` : `${task.title} 已完成。`,
        level: "success",
      });
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

  // ─── Agent Call API Handlers ────────────────────────────────────────────────
  async function startAgentCall() {
    setAgentCall({
      active: true,
      sessionId: null,
      phase: "dialing",
      transcript: [],
      stage: "",
      taskSlots: {},
      careInsight: null,
      isProcessing: true,
      finalizeResult: null,
    });

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
          // If scheduler already started a call, use its session
          setAgentCall((prev) => ({
            ...prev,
            sessionId: occId,
            phase: "connected",
            isProcessing: false,
            transcript: [{ role: "assistant", text: "调度器已触发通话，请通过下方输入框模拟老人回复。" }],
          }));
          return;
        }
        setAgentCall((prev) => ({
          ...prev,
          phase: "ended",
          isProcessing: false,
          transcript: [{ role: "assistant", text: "当前没有可调度的任务实例，请先通过“调度器 Tick”创建。" }],
        }));
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

      setAgentCall((prev) => ({
        ...prev,
        sessionId: startData.call_session_id,
        phase: "connected",
        stage: startData.stage ?? "",
        isProcessing: false,
        transcript: startData.initial_reply
          ? [{ role: "assistant", text: startData.initial_reply }]
          : [],
      }));
    } catch (err) {
      setAgentCall((prev) => ({
        ...prev,
        phase: "ended",
        isProcessing: false,
        transcript: [{ role: "assistant", text: `呼叫失败: ${err instanceof Error ? err.message : "未知错误"}` }],
      }));
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
      const draftResult = buildTaskDrafts(trimmed, elders, currentElder);
      if ("error" in draftResult) {
        const errorMessage = draftResult.error ?? "这件事我还差一点信息，先帮你补齐。";
        appendAssistantMessage({
          id: uid("msg"),
          role: "assistant",
          kind: "text",
          content: errorMessage,
        });
        return;
      }

      appendAssistantMessage({
        id: uid("msg"),
        role: "assistant",
        kind: "taskDraft",
        content: "我帮你整理好了，确认一下就可以。",
        drafts: draftResult.drafts,
      });
      return;
    }

    appendAssistantMessage({
      id: uid("msg"),
      role: "assistant",
      kind: "text",
      content: "我目前最擅长 3 件事：创建提醒、查回执、把话改得更温柔。你可以直接对我说一句完整的话试试。",
    });
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

  if (userMode === "elder") {
    return (
      <main className="mx-auto min-h-screen max-w-md px-0 text-stone-800">
        {callSession.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[36px] bg-stone-950 p-4 text-white shadow-2xl">
              <div className="rounded-[28px] bg-[#1B1B1B] p-5">
                <p className="text-center text-xs text-stone-400">小助理帮忙打电话</p>
                <div className="mt-5 flex justify-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-300 text-3xl text-stone-900">
                    助
                  </div>
                </div>
                <p className="mt-4 text-center text-2xl font-semibold">{currentElder?.displayName ?? "长辈"}</p>
                <p className="mt-2 text-center text-sm text-stone-400">
                  {callSession.phase === "dialing" && "正在呼叫中..."}
                  {callSession.phase === "connected" && "通话已接通"}
                  {callSession.phase === "missed" && "暂时无人接听"}
                  {callSession.phase === "ended" && "通话已结束"}
                </p>
                <div className="mt-5 flex items-end justify-center gap-2">
                  {[28, 18, 30, 14, 26, 20].map((height, index) => (
                    <span key={index} className="w-2 rounded-full bg-orange-300/80" style={{ height }} />
                  ))}
                </div>
                <div className="mt-5 rounded-[24px] bg-white/8 p-4 text-sm leading-7 text-stone-100">
                  {buildCallScript(currentCallTask, currentElder)}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateCallPhase("connected")}
                    className="min-h-12 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium"
                  >
                    模拟接通
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCallPhase("missed")}
                    className="min-h-12 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-medium"
                  >
                    暂未接听
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentCallTask) applyTaskStatus(currentCallTask, "confirmed", "我知道了");
                      closeCall();
                    }}
                    className="min-h-12 rounded-2xl bg-white/12 px-4 py-3 text-sm font-medium"
                  >
                    我知道了
                  </button>
                  <button
                    type="button"
                    onClick={closeCall}
                    className="min-h-12 rounded-2xl bg-white/12 px-4 py-3 text-sm font-medium"
                  >
                    结束通话
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
          <div className="w-full max-w-sm rounded-[36px] border border-orange-100 bg-[linear-gradient(180deg,#FFF9F3_0%,#FFF3E7_100%)] p-4 shadow-[0_24px_60px_rgba(145,94,61,0.2)]">
            <div className="rounded-[30px] border border-orange-100/80 bg-white/88 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-orange-500">家里小助理来电</p>
                  <p className="mt-2 text-2xl font-semibold text-stone-800">{currentElder?.displayName ?? "长辈"}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {callSession.phase === "dialing" && "正在轻轻提醒中"}
                    {callSession.phase === "connected" && "已经接通，正在陪着说"}
                    {callSession.phase === "missed" && "暂时没有接通"}
                    {callSession.phase === "ended" && "这次通话先结束了"}
                  </p>
                </div>
                <div className="rounded-full bg-[#FFF1C7] px-3 py-1 text-xs font-medium text-orange-600">
                  {currentCallTask?.title ?? "问候一下"}
                </div>
              </div>

              <div className="mt-5 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[linear-gradient(180deg,#F6B58C_0%,#F2996E_100%)] text-3xl font-semibold text-white shadow-[0_14px_30px_rgba(242,153,110,0.3)]">
                  助
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-orange-100 bg-[#FFF8F3] p-4 text-sm leading-7 text-stone-700">
                {buildCallScript(currentCallTask, currentElder)}
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs text-stone-500">这通提醒现在走到这里</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {callProgressSteps.map((step, index) => (
                    <div key={step.key} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={step.onClick}
                        className={`min-h-[84px] min-w-[118px] rounded-[22px] border px-4 py-3 text-left ${
                          step.active
                            ? "border-orange-200 bg-orange-50 text-stone-800"
                            : step.done
                              ? "border-emerald-200 bg-emerald-50 text-stone-800"
                              : "border-stone-200 bg-stone-50 text-stone-500"
                        }`}
                      >
                        <p className="text-sm font-medium">{step.label}</p>
                        <p className="mt-1 text-xs">{step.hint}</p>
                      </button>
                      {index < callProgressSteps.length - 1 && <span className="text-stone-300">-</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateCallPhase("missed")}
                    className="min-h-10 rounded-full border border-orange-100 bg-white px-4 text-xs text-stone-600"
                  >
                    暂时没接到
                  </button>
                  <button
                    type="button"
                    onClick={closeCall}
                    className="min-h-10 rounded-full border border-orange-100 bg-white px-4 text-xs text-stone-600"
                  >
                    先收起
                  </button>
                </div>
              </div>
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

      {userMode === "child" && (
        <button
          type="button"
          onClick={() => setActiveTab((prev) => (prev === "notifications" ? lastPrimaryTab : "notifications"))}
          className={`fixed right-3 top-3 z-40 inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-medium shadow-sm backdrop-blur sm:right-4 sm:top-4 ${
            activeTab === "notifications"
              ? "border-orange-200 bg-[#F2996E] text-white"
              : "border-orange-100 bg-white/90 text-stone-700"
          }`}
        >
          通知
          {notifications.length > 0 && (
            <span
              className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] ${
                activeTab === "notifications" ? "bg-white/20 text-white" : "bg-orange-50 text-orange-600"
              }`}
            >
              {Math.min(99, notifications.length)}
            </span>
          )}
        </button>
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

      <section className={activeTab === "home" ? "flex h-full flex-col overflow-hidden pb-[74px]" : "space-y-3 pb-24"}>
        {activeTab === "home" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-orange-100 bg-[#FFF8F3] shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
            <div className="border-b border-orange-100 bg-[linear-gradient(180deg,#FFF7EE_0%,#FFFDF9_100%)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[17px] font-semibold text-stone-800">家里小助理</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("assistant")}
                      className="min-h-8 rounded-full border border-orange-100 bg-white px-3 text-[11px] font-medium text-orange-600"
                    >
                      性格
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

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              <div className="space-y-3">
                <div
                  className={`sticky top-0 z-10 -mx-1 rounded-[18px] border border-orange-100 bg-[#FFF1C7]/95 px-4 shadow-sm backdrop-blur ${
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
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] rounded-[20px] px-4 py-3 text-[15px] leading-7 shadow-sm ${
                        message.role === "user"
                          ? "bg-[#F2996E] text-white shadow-[0_10px_24px_rgba(242,153,110,0.22)]"
                          : "border border-orange-100 bg-[#FFFDFB] text-stone-700"
                      }`}
                    >
                      <p>{message.content}</p>
                      {message.kind === "taskDraft" && message.drafts && (
                        <div className="mt-3 space-y-3">
                          {message.drafts.map((draft) => (
                            <div key={draft.id} className="rounded-2xl border border-orange-100 bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold">{draft.title}</p>
                                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-600">
                                  {draft.priority}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2 text-sm text-stone-600">
                                <p>长辈：{draft.elderDisplayName}</p>
                                <p>提醒时间：{draft.remindLabel}</p>
                                <p>触达方式：{draft.channel}</p>
                                <p>需要确认：{draft.needConfirmation ? "是" : "否"}</p>
                                <p>需要结果：{draft.needResult ? "是" : "否"}</p>
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
                            <div key={version.style} className="rounded-2xl bg-[#FFF1C7] p-4">
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
                ))}
                {isSubmitting && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-[20px] border border-orange-100 bg-[#FFFDFB] px-4 py-3 text-[15px] leading-7 text-stone-700">
                      正在帮你想一想...
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-orange-100 bg-[linear-gradient(180deg,#FFFDF9_0%,#FFF5EA_100%)] px-3 pb-1 pt-3">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {["发提醒", "写小纸条", "查状态", "电话触达"].map((label) => (
                  <span key={label} className="shrink-0 rounded-full border border-orange-100/60 bg-white px-3 py-1.5 text-[11px] text-stone-500">
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="突然想起什么，就告诉我..."
                  className="min-h-12 flex-1 resize-none rounded-[24px] border border-orange-100 bg-[#FFFDFB] px-4 py-3 text-[15px] text-stone-700 outline-none"
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
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">任务列表</h2>
                  <p className="text-sm text-stone-500">明确区分已触达、已确认和已完成</p>
                </div>
                <button
                  type="button"
                  onClick={triggerSchedulerTick}
                  className="min-h-10 rounded-full bg-violet-100 px-4 py-2 text-xs font-medium text-violet-700"
                >
                  ⚡ 调度器 Tick
                </button>
              </div>
              {schedulerResult && (
                <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 whitespace-pre-wrap">
                  {schedulerResult}
                </div>
              )}
              <div className="space-y-3">
                {sortedTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`min-h-24 w-full rounded-[24px] border p-4 text-left ${selectedTaskId === task.id ? "border-orange-300 bg-orange-50/60" : "border-stone-100 bg-stone-50/40"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{task.title}</p>
                        <p className="mt-1 text-sm text-stone-500">
                          {task.elderDisplayName}｜{task.remindLabel}｜{task.channel}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="mt-3 text-sm text-stone-600">{task.content}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
              {selectedTask ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-stone-500">任务详情</p>
                      <h2 className="text-lg font-semibold">{selectedTask.title}</h2>
                    </div>
                    <StatusBadge status={selectedTask.status} />
                  </div>

                  <div className="mt-4 grid gap-3 rounded-[24px] bg-orange-50/60 p-4 text-sm text-stone-700">
                    <p>长辈：{selectedTask.elderDisplayName}</p>
                    <p>时间：{selectedTask.remindLabel}</p>
                    <p>触达方式：{selectedTask.channel}</p>
                    <p>回执要求：{selectedTask.needResult ? "需要结果" : "确认收到即可"}</p>
                    <p>最近回复：{selectedTask.result ?? "还没有明确回复"}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openCall(selectedTask, "child")}
                      className="min-h-12 rounded-full bg-[#FFF1C7] px-4 py-2 text-xs text-stone-700"
                    >
                      电话提醒
                    </button>
                    <button
                      type="button"
                      onClick={startAgentCall}
                      className="min-h-12 rounded-full bg-[#F2996E] px-4 py-2 text-xs font-medium text-white"
                    >
                      🤖 模拟 Agent 电话
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTaskStatus(selectedTask, "reached")}
                      className="min-h-12 rounded-full bg-sky-100 px-4 py-2 text-xs text-sky-700"
                    >
                      模拟电话触达
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTaskStatus(selectedTask, "confirmed")}
                      className="min-h-12 rounded-full bg-emerald-100 px-4 py-2 text-xs text-emerald-700"
                    >
                      模拟说知道了
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyTaskStatus(
                          selectedTask,
                          "completed",
                          selectedTask.needResult ? "血糖 6.1" : "已经做完了",
                        )
                      }
                      className="min-h-12 rounded-full bg-emerald-500 px-4 py-2 text-xs text-white"
                    >
                      模拟完成
                    </button>
                  </div>

                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-stone-700">执行记录</h3>
                    <div className="mt-3 space-y-3">
                      {[...selectedTask.logs].reverse().map((log) => (
                        <div key={log.id} className="rounded-2xl border border-stone-100 bg-stone-50/70 p-3 text-sm text-stone-600">
                          <p>{log.event}</p>
                          <p className="mt-1 text-xs text-stone-400">{log.time}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[280px] items-center justify-center text-sm text-stone-500">
                  选中一条任务，就能查看完整回执链路。
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
            <h2 className="text-lg font-semibold">通知中心</h2>
            <p className="mt-1 text-sm text-stone-500">集中展示回执、未回应提醒和今日摘要</p>
            <div className="mt-4 space-y-3">
              {notifications.map((notice) => (
                <div key={notice.id} className={`rounded-[24px] p-4 ${getNoticeClass(notice.level)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{notice.title}</p>
                      <p className="mt-1 text-sm">{notice.detail}</p>
                    </div>
                    <span className="text-xs opacity-70">{notice.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
                <h2 className="text-lg font-semibold">长辈档案</h2>
                <div className="mt-4 space-y-3">
                  {currentElder ? (
                    <div className="rounded-[24px] bg-orange-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-semibold">{currentElder.displayName}</p>
                          <p className="mt-2 text-sm text-stone-600">关系：{currentElder.relation}</p>
                          <p className="mt-1 text-sm text-stone-600">电话：{currentElder.phone}</p>
                          <p className="mt-1 text-sm text-stone-600">方便时间：{currentElder.availableTime}</p>
                          <p className="mt-1 text-sm text-stone-600">回应习惯：{currentElder.responseHabit || "待补充"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => beginEditElder(currentElder)}
                          className="min-h-10 rounded-full bg-white px-4 text-xs font-medium text-stone-700"
                        >
                          编辑
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-[24px] border border-orange-100 bg-white p-3">
                    <p className="text-sm font-medium text-stone-700">全部长辈</p>
                    <div className="mt-3 space-y-2">
                      {elders.map((elder) => {
                        const active = elder.id === currentElderId;
                        return (
                          <div
                            key={elder.id}
                            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                              active ? "border-orange-200 bg-orange-50/60" : "border-stone-100 bg-stone-50/40"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setCurrentElderId(elder.id)}
                              className="min-h-10 flex-1 text-left"
                            >
                              <p className="font-medium text-stone-800">{elder.displayName}</p>
                              <p className="mt-1 text-xs text-stone-500">{elder.relation} · {elder.phone}</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => beginEditElder(elder)}
                              className="min-h-10 rounded-full border border-orange-100 bg-white px-4 text-xs font-medium text-stone-700"
                            >
                              编辑
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{editingElderId ? "编辑长辈" : "添加一位长辈"}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddElder((prev) => {
                        const next = !prev;
                        if (next) {
                          if (!editingElderId) resetForm();
                        } else {
                          setEditingElderId(null);
                          resetForm();
                        }
                        return next;
                      });
                    }}
                    className="min-h-12 rounded-full bg-orange-50 px-4 py-2 text-xs text-orange-600"
                  >
                    {showAddElder ? "收起" : editingElderId ? "继续编辑" : "展开"}
                  </button>
                </div>

                {showAddElder ? (
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
                ) : (
                  <div className="mt-4 rounded-[24px] bg-orange-50/70 p-4 text-sm leading-6 text-stone-600">
                    支持多位长辈独立维护画像、任务和回执。你也可以直接在聊天里说“我想加一下外公”。
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === "assistant" && (
          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">编辑小助理性格</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("home")}
                  className="min-h-12 rounded-full bg-orange-50 px-4 py-2 text-xs text-stone-700"
                >
                  返回小助理
                </button>
              </div>
              <p className="mt-1 text-sm text-stone-500">决定 TA 做电话提醒、发提醒和转述小纸条时的感觉。</p>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-stone-700">语气</p>
                  <div className="flex flex-wrap gap-2">
                    {["温柔陪伴", "亲切直接", "像晚辈一样", "稳重安心"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAssistantProfile((prev) => ({ ...prev, tone: item }))}
                        className={`min-h-12 rounded-full px-3 py-2 text-sm ${assistantProfile.tone === item ? "bg-[#F2996E] text-white" : "bg-orange-50 text-stone-600"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-stone-700">表达节奏</p>
                  <div className="flex flex-wrap gap-2">
                    {["简短清楚", "慢一点", "多提醒一句", "先寒暄再提醒"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAssistantProfile((prev) => ({ ...prev, rhythm: item }))}
                        className={`min-h-12 rounded-full px-3 py-2 text-sm ${assistantProfile.rhythm === item ? "bg-[#F2996E] text-white" : "bg-orange-50 text-stone-600"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-stone-700">主动程度</p>
                  <div className="flex flex-wrap gap-2">
                    {["适度主动", "少打扰", "多确认一次", "需要时再追问"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAssistantProfile((prev) => ({ ...prev, initiative: item }))}
                        className={`min-h-12 rounded-full px-3 py-2 text-sm ${assistantProfile.initiative === item ? "bg-[#F2996E] text-white" : "bg-orange-50 text-stone-600"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-stone-700">一句印象</p>
                  <input
                    value={assistantProfile.signature}
                    onChange={(event) => setAssistantProfile((prev) => ({ ...prev, signature: event.target.value }))}
                    className="min-h-12 w-full rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-base outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-orange-100 bg-white p-4 shadow-[0_18px_50px_rgba(242,153,110,0.12)]">
              <h2 className="text-lg font-semibold">预览效果</h2>
              <div className="mt-4 rounded-[24px] bg-[#FFF1C7] p-4">
                <p className="text-sm font-medium text-orange-600">给长辈的开场白</p>
                <p className="mt-2 text-sm leading-7 text-stone-700">
                  {buildAssistantPreview(assistantProfile, currentElder?.displayName ?? "妈妈")}
                </p>
              </div>

              <div className="mt-4 rounded-[24px] border border-orange-100 bg-orange-50/50 p-4">
                <p className="text-sm font-medium text-stone-700">电话提醒时会这样说</p>
                <p className="mt-2 text-sm leading-7 text-stone-700">
                  {buildCallScript(selectedTask ?? latestElderTask, currentElder)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openCall(selectedTask ?? latestElderTask, "child")}
                className="mt-4 min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-sm font-medium text-white"
              >
                用这个性格试打一个电话
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-5xl px-3 pb-[calc(4px+env(safe-area-inset-bottom))] pt-0 sm:px-4">
        <div className="grid grid-cols-3 gap-2 rounded-[26px] border border-orange-100 bg-white/95 p-2 shadow-[0_18px_40px_rgba(242,153,110,0.18)] backdrop-blur">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-[18px] px-2 text-xs font-medium ${
                (activeTab === tab.key ||
                  (activeTab === "assistant" && tab.key === "home") ||
                  (activeTab === "notifications" && tab.key === lastPrimaryTab)) ||
                (activeTab === "notifications" && lastPrimaryTab === tab.key)
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
          ))}
        </div>
      </div>
    </main>
  );
}
