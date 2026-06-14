import { NextResponse } from "next/server";
import { callLLMJson, type ChatMessage } from "@/src/lib/llm/llm-provider";
import { sanitizeAssistantReply as runSafetyCheck } from "@/src/lib/agents/safety-guard";
import { store } from "@/src/lib/store/memory-store";
import { isV2Enabled, shouldFallbackToV1 } from "@/src/lib/workflows/feature-flag";
import { processTurn as v2ProcessTurn } from "@/src/lib/workflows/call.workflow";
import * as callSessionService from "@/src/lib/services/call-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────

type LockedElderContext = {
  elderId: string;
  displayName: string;
  callName: string;        // 通话中使用的称呼（通常 = displayName）
  relation: string;
  nicknames: string[];
  healthFocus: string[];
  communicationPreference: string[];
  responseHabit: string;
  personalityTraits: string[];
  recentSignals: string[];
  oneLinePortrait: string;
};

type CallStage =
  | "greeting" | "warm_chat" | "task_reminder" | "task_followup"
  | "relay" | "escalation" | "closing" | "ended";

// escalation：健康异常时的安抚+通知家属，区别于普通 closing

type CallOutcome =
  | "task_done"           // 老人说"吃过了" → 任务完成
  | "task_not_done"       // 老人说"没吃" → 任务未完成
  | "task_postponed"      // 老人说"等会吃" → 延后
  | "needs_help"          // 老人说"找不到药" → 需要帮助
  | "health_alert"        // 老人说"头晕不舒服" → 健康告警
  | "elder_ended"         // 老人说"挂了/忙" → 长辈主动结束
  | "no_response"         // 一直没回应 → 无响应
  | "timeout"             // 全局轮数超限 → 保护性结束
  | "unknown";            // 其他

type TaskContext = {
  id: string;
  type: string;
  content: string;
  elderDisplayName?: string;
  elderId?: string;
} | null;

type CallSessionState = {
  sessionId: string;
  elderId: string;
  elder: LockedElderContext;
  task: TaskContext;
  reformulatedTask: string;        // 称谓转换后的任务描述
  caregiverName: string;
  relayMessage?: string;
  stage: CallStage;
  turnsInStage: number;
  totalTurns: number;              // 全局总轮数
  consecutiveConfusedCount: number; // 连续 confused/identity_question 次数
  history: Array<{ role: "assistant" | "elder"; text: string }>;
  outcome?: CallOutcome;           // 通话最终结果（closing/ended 时设置）
  createdAt: number;
};

type ElderIntent =
  | "confirmed" | "denied" | "postponed" | "needs_help"
  | "confused" | "off_topic" | "end_requested"
  | "identity_question" | "health_abnormal"
  | "measurement_value"    // 老人说"血糖8.5""血压150"，提取数值
  | "relay_message"        // 老人说"跟小雨说我没事"，需记录转达
  | "no_response" | "unknown";

type ClassifiedIntent = {
  intent: ElderIntent;
  confidence: number;       // 0-1
  evidence: string;         // 匹配到的关键词
  healthAlert?: boolean;    // 是否需要通知家属
  capturedValue?: string;   // 如老人说"血糖 8.5"，这里捕获 "8.5"
  relayContent?: string;    // 如老人说"跟小雨说我没事"，这里捕获留言内容
};

type CapturedTaskStatus =
  | { status: "done"; note: string }
  | { status: "not_done"; reason?: string; note: string }
  | { status: "postponed"; note: string }
  | { status: "needs_help"; issue: string; note: string }
  | { status: "health_abnormal"; symptomOrValue: string; note: string }
  | { status: "unknown"; note: string };

// ── SessionStore（异步接口，开发环境内存实现） ─────────────────────────────

interface SessionStore {
  get(sessionId: string): Promise<CallSessionState | null>;
  set(sessionId: string, state: CallSessionState, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

// 开发环境内存实现（带 TTL，默认 30 分钟过期）
const memoryStore = new Map<string, { state: CallSessionState; expiresAt: number }>();
const sessionStore: SessionStore = {
  get: async (id) => {
    const entry = memoryStore.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(id);
      return null;
    }
    return entry.state;
  },
  set: async (id, state, ttlSeconds = 1800) => {
    memoryStore.set(id, { state, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
  delete: async (id) => { memoryStore.delete(id); },
};

// ── 称谓转换函数 ─────────────────────────────────────────────────────────

function reformulateTaskForCall(
  content: string,
  elder: LockedElderContext,
  caregiverName: string,
): string {
  // 构建待替换称谓列表：displayName + relation + nicknames
  const allNames = [...new Set([
    elder.displayName, elder.relation, ...elder.nicknames
  ])].filter(Boolean);

  // 多字符称谓可以安全全局替换；单字符称谓只能前缀匹配
  const safeNames = allNames.filter(n => n.length >= 2)
    .sort((a, b) => b.length - a.length); // 长的先替换，避免"老妈"先于"妈妈"
  const riskyNames = allNames.filter(n => n.length === 1);

  // escape 正则字符（昵称可能含括号/空格等特殊符号）
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let result = content;
  for (const name of safeNames) {
    result = result.replaceAll(name, "您");
  }
  // 单字昵称只在"称谓+逗号"前缀位置替换（如句首的"妈，"），不做全局替换
  for (const name of riskyNames) {
    result = result.replace(new RegExp(`^${esc(name)}[，,]`), "您，");
    result = result.replace(new RegExp(`^提醒${esc(name)}[，,]?`), "");
  }

  // 去掉"提醒您"前缀（念念直接在跟本人说话，不需要说"提醒您"）
  result = result.replace(/^提醒您[，,]?/, "");

  // "告诉我/回我一声/跟我说/给我说/发我一下/告诉孩子一声" 中"我"或"孩子"指子女，替换为 caregiverName
  result = result.replace(/告诉我/g, `告诉${caregiverName}`);
  result = result.replace(/回我一声/g, `跟${caregiverName}说一声`);
  result = result.replace(/跟我说/g, `跟${caregiverName}说`);
  result = result.replace(/给我说/g, `给${caregiverName}说`);
  result = result.replace(/发我一下/g, `发给${caregiverName}`);
  result = result.replace(/告诉孩子/g, `告诉${caregiverName}`);

  return result.trim();
}

// ── 意图分类 ─────────────────────────────────────────────────────────────

function classifyIntent(
  input: string,
  currentStage: CallStage,
  caregiverName: string,
): ClassifiedIntent {
  if (!input?.trim()) {
    return { intent: "no_response", confidence: 1.0, evidence: "空输入" };
  }

  const text = input.trim();

  // 1. 健康异常（最高优先级，带否定排除）
  // 先排除否定表述："没有不舒服""不痛""没事" 不算健康异常
  const isHealthDenial = /没有不舒服|不痛|没痛|不疼|没有事|没事|没有头晕|没有问题/.test(text);
  if (!isHealthDenial && /不舒服|头晕|胸闷|心慌|恶心|痛|血糖高|血压高|血糖低|犯晕|喘不上/.test(text)) {
    const valueMatch = text.match(/(\d+\.?\d*)/);
    return {
      intent: "health_abnormal",
      confidence: 0.9,
      evidence: text,
      healthAlert: true,
      capturedValue: valueMatch?.[1],
    };
  }

  // 1b. 测量数值：指标词 + 数值（修正后的正则）
  const measurementMatch = text.match(/(血糖|血压|心率|体温).{0,6}?(\d+\.?\d*(\/\d+)?)/);
  if (measurementMatch) {
    return {
      intent: "measurement_value",
      confidence: 0.85,
      evidence: text,
      capturedValue: measurementMatch[2],
    };
  }
  // 纯数值回复（如"8.5""一百二"）
  if (/^[\d.]+$|^一百|^二百/.test(text)) {
    return {
      intent: "measurement_value",
      confidence: 0.7,
      evidence: text,
      capturedValue: text,
    };
  }

  // 2. 结束通话
  if (/挂(了|电话)|再见|不想聊|改天|没空/.test(text)) {
    return { intent: "end_requested", confidence: 0.9, evidence: text };
  }
  // "不方便"是 end_requested 而非 confirmed
  if (/不方便|不太方便|现在忙|正忙/.test(text)) {
    return { intent: "end_requested", confidence: 0.8, evidence: text };
  }

  // 3. 身份问题
  if (/你是谁|你找谁|你是小雨吗|哪位|你是什么/.test(text)) {
    return { intent: "identity_question", confidence: 0.9, evidence: text };
  }

  // 4. 听不清/困惑
  if (/听不清|没听|没明白|说什么|大声点|再说一遍|听不懂|大点声|你再说/.test(text)) {
    return { intent: "confused", confidence: 0.9, evidence: text };
  }

  // 4b. 留言转达（动态匹配 caregiverName + 泛称）
  const relayPattern = new RegExp(
    `(?:跟|告诉|转告|发|给)(${caregiverName}|孩子|儿子|女儿|家人)(.*)`,
  );
  const relayMatch = text.match(relayPattern);
  if (relayMatch) {
    return {
      intent: "relay_message",
      confidence: 0.85,
      evidence: text,
      relayContent: relayMatch[2]?.trim() || text,
    };
  }

  // 5. 复合句组合判断：同时有"否认"和"延后"时，优先判 postponed
  // 例："没吃，等会儿吃" → postponed（不是 denied）
  const hasDeny = /没吃|没测|没做|没量|没喝|不想|不愿意|不肯|不要|别提醒/.test(text);
  const hasPostpone = /等(会|一下|会儿)|晚点|待会儿|过一会|等下/.test(text);
  if (hasDeny && hasPostpone) {
    return { intent: "postponed", confidence: 0.85, evidence: text };
  }

  // 6. 需要帮助
  if (/不会测|不会用|找不到|药没|忘了|忘记了|漏了|丢了|不知道怎么/.test(text)) {
    return { intent: "needs_help", confidence: 0.85, evidence: text };
  }

  // 7. 延后
  if (hasPostpone) {
    return { intent: "postponed", confidence: 0.85, evidence: text };
  }

  // 8. 否认
  if (/没吃|没测|没做|没量|没喝/.test(text)) {
    return { intent: "denied", confidence: 0.85, evidence: text };
  }
  if (/不想|不愿意|不肯|不要|别提醒/.test(text)) {
    return { intent: "denied", confidence: 0.8, evidence: text };
  }

  // 9. 确认（前置否定检测 + stage 约束）
  // 在 warm_chat 阶段，"好的/行/嗯嗯" 只表示愿意继续聊，不算任务完成
  // 只有在 task_reminder/task_followup 阶段才算任务确认
  const hasNegation = /不|没|别|未/.test(text);
  if (!hasNegation) {
    // 任务相关确认（在任何阶段都算）
    if (/吃(了|完|过|啦|咯)|测(了|完|啦)|做(了|完|啦)|量(了|完|啦)|收到|没问题/.test(text)) {
      return { intent: "confirmed", confidence: 0.85, evidence: text };
    }
    // "好的/行/嗯嗯" 只在任务阶段算任务确认
    if (/知道了|好的|嗯嗯|行|可以/.test(text)) {
      if (currentStage === "task_reminder" || currentStage === "task_followup") {
        return { intent: "confirmed", confidence: 0.8, evidence: text };
      }
      // warm_chat 阶段只是表示愿意继续，算 off_topic
      return { intent: "off_topic", confidence: 0.5, evidence: text };
    }
    // "方便"单独判断：仅在问候/寒暄阶段算“愿意继续”=confirmed
    // 在任务阶段（task_reminder / task_followup）“方便”只是懒撒/应付，不算任务完成 → off_topic
    if (/^方便|方便的|可以的/.test(text)) {
      if (currentStage === "task_reminder" || currentStage === "task_followup") {
        return { intent: "off_topic", confidence: 0.6, evidence: text };
      }
      return { intent: "confirmed", confidence: 0.8, evidence: text };
    }
  }

  return { intent: "off_topic", confidence: 0.3, evidence: text };
}

// ── 状态机推进 ─────────────────────────────────────────────────────────────

function advanceStage(
  session: CallSessionState,
  classified: ClassifiedIntent,
  input?: string,                  // T0 修复：“方便/好的”不误推进→需要原始输入判断是否含明确动作词
): { nextStage: CallStage; shouldEndCall: boolean; outcome?: CallOutcome } {
  const { stage, turnsInStage, totalTurns, consecutiveConfusedCount } = session;
  const intent = classified.intent;

  // 全局保护：总轮数超过 12，保护性结束（非自然结束）
  if (totalTurns >= 12) {
    return { nextStage: "closing", shouldEndCall: true, outcome: "timeout" };
  }

  // 连续 confused/identity_question 超过 3 次，温和结束
  if (consecutiveConfusedCount >= 3 && (intent === "confused" || intent === "identity_question")) {
    return { nextStage: "closing", shouldEndCall: true, outcome: "unknown" };
  }

  // 特殊意图优先（不分阶段，严格优先级）
  // 1. 健康异常 → escalation（不是普通 closing）
  if (intent === "health_abnormal") {
    return { nextStage: "escalation", shouldEndCall: true, outcome: "health_alert" };
  }
  // 2. 结束通话 → closing，记录 elder_ended
  if (intent === "end_requested") {
    return { nextStage: "closing", shouldEndCall: true, outcome: "elder_ended" };
  }
  // 3. 身份问题 → 不推进，重新自我介绍
  if (intent === "identity_question") {
    return { nextStage: stage, shouldEndCall: false };
  }
  // 4. 听不清 → 不推进，简化句子
  if (intent === "confused") {
    return { nextStage: stage, shouldEndCall: false };
  }
  // 4b. 留言转达 → 不改变阶段，只记录 relayContent
  if (intent === "relay_message") {
    return { nextStage: stage, shouldEndCall: false };
  }
  // 4c. 测量数值 → 视为 confirmed
  if (intent === "measurement_value") {
    // 在任务阶段，数值意味着完成
    if (stage === "task_reminder" || stage === "task_followup") {
      return { nextStage: "relay", shouldEndCall: false, outcome: "task_done" };
    }
    return { nextStage: stage, shouldEndCall: false };
  }

  switch (stage) {
    case "greeting":
      return { nextStage: "warm_chat", shouldEndCall: false };

    case "warm_chat":
      // max 2 轮寒暄后强制推进到任务
      // 注意："好的/行" 在 warm_chat 会被 classifyIntent 判为 off_topic（不是 confirmed）
      // 所以这里 off_topic 也会推进到 task_reminder
      if (turnsInStage >= 2 || intent === "confirmed" || intent === "off_topic") {
        return { nextStage: "task_reminder", shouldEndCall: false };
      }
      return { nextStage: "warm_chat", shouldEndCall: false };

    case "task_reminder": {
      // 明确“任务完成”才能推 relay：必须含动作词 + 有 capturedValue/measurement
      // 例：只说“好的/行/嗯嗯/方便”不算完成（只是应付/愿意继续）
      if (intent === "confirmed") {
        const hasActionWord = /吃(了|完|过|啦|咯)|测(了|完|啦)|做(了|完|啦)|量(了|完|啦)|喝(了|完|啦)|收(到|下了)|没问题|好了|完成/.test(input ?? "");
        const hasCaptured = Boolean(classified.capturedValue);
        if (hasActionWord || hasCaptured) {
          return { nextStage: "relay", shouldEndCall: false, outcome: "task_done" };
        }
        // 只说“好的/行/嗯嗯/方便” → 继续追问，不推进阶段
        return { nextStage: "task_reminder", shouldEndCall: false };
      }
      if (intent === "denied" || intent === "postponed" || intent === "needs_help") {
        return { nextStage: "task_followup", shouldEndCall: false };
      }
      // off_topic 不马上强推，先轻柔拉回一次
      if (intent === "off_topic" && turnsInStage < 2) {
        return { nextStage: "task_reminder", shouldEndCall: false };
      }
      // max 4 轮追问后强制推进
      if (turnsInStage >= 4) return { nextStage: "relay", shouldEndCall: false };
      return { nextStage: "task_reminder", shouldEndCall: false };
    }

    case "task_followup":
      // max 2 轮后推进到 relay
      if (turnsInStage >= 2) return { nextStage: "relay", shouldEndCall: false };
      if (intent === "confirmed") return { nextStage: "relay", shouldEndCall: false, outcome: "task_done" };
      if (intent === "postponed") return { nextStage: "relay", shouldEndCall: false, outcome: "task_postponed" };
      return { nextStage: "task_followup", shouldEndCall: false };

    case "relay":
      return { nextStage: "closing", shouldEndCall: false };

    case "escalation":
      return { nextStage: "ended", shouldEndCall: true };

    case "closing":
      return { nextStage: "ended", shouldEndCall: true };

    default:
      return { nextStage: "ended", shouldEndCall: true };
  }
}

// ── 任务状态捕获 ─────────────────────────────────────────────────────────

function captureTaskStatus(classified: ClassifiedIntent): CapturedTaskStatus {
  const note = classified.evidence;
  switch (classified.intent) {
    case "confirmed":
      return { status: "done", note };
    case "denied":
      return { status: "not_done", note };
    case "postponed":
      return { status: "postponed", note };
    case "needs_help":
      return { status: "needs_help", issue: note, note };
    case "health_abnormal":
      return { status: "health_abnormal", symptomOrValue: classified.capturedValue ?? note, note };
    default:
      return { status: "unknown", note };
  }
}

// ── 分阶段 LLM Prompt ─────────────────────────────────────────────────────

function buildStageInstruction(
  stage: CallStage,
  session: CallSessionState,
  elderInput?: string,
): string {
  const { elder, reformulatedTask, caregiverName } = session;
  const callName = elder.callName;

  // ── 所有 stage 统一的输出格式约束：必须 JSON · 严防 markdown 包裹 ──
  // 这条约束是修复「驴唇不对马嘴」的关键，避免 DeepSeek 偶尔输出 ```json``` 包裹导致 JSON.parse 失败、最终走 fallback
  const JSON_FORMAT_SUFFIX = `
## 输出格式（极其重要！必须严格遵守）
- 严格按 JSON 输出，格式为：{"reply": "<你这一句要说的话>"}
- 只输出一个 JSON 对象，不要任何 markdown 包裹（不要 \`\`\`json / \`\`\`）
- 不要输出任何额外字段（不要 stage / intent / analysis 等）
- \`reply\` 必须是纯中文对话文本，不要加引号以外的说明`;

  // 核心风格规则：禁用「您/您呀」「喂」「我是您的小宝贝」三类语气，改用亲昵称呼
  const base = `## 称谓规则（极其重要！必须严格遵守！）
- 你是${callName}家里设置的小助理念念，跟${callName}是亲昵的晚辈关系
- 直接叫${callName}亲昵称呼（如“妈”“奶奶”“姥姥”“阿姨”等）或直接叫名字“${callName}”，不要加“呀”后缀
- 严禁使用「您」「您呀」——这是硬约束，违反就违规
- 严禁以「喂」开头或使用「喂」
- 严禁自称「我是您的小宝贝」「我是您的小棉袄」等暧昧/低龄化称呼——你是小助理
- 对话风格：活泼温暖的晚辈妹妹，多用语气词（呢、嘛、啦、哈喽、~），每次只说一两句话`;

  const instructions: Record<CallStage, string> = {
    greeting: `${base}\n\n当前任务：自我介绍 + 问${callName}是否方便。\n生成一两句话。`,
    warm_chat: `${base}\n\n当前任务：关心一句家常（身体/心情/日常）。不提任务。\n生成一两句话。`,
    task_reminder: `${base}\n\n当前任务：自然地提到提醒事项："${reformulatedTask}"。\n要具体问（如"药吃了吗""血糖测了吗"）。\n禁止说"我记下来了"。\n生成一两句话。`,
    task_followup: `${base}\n\n当前任务：${callName}刚才说了"${elderInput}"，根据这个反馈温和地追问或确认。\n如长辈说"等会儿吃"→"好的呀，吃完跟${caregiverName}说一声哦"。\n生成一两句话。`,
    relay: `${base}\n\n当前任务：问${callName}有没有话想带给${caregiverName}。\n生成一两句话。`,
    escalation: `${base}\n\n当前任务：${callName}刚才说身体不舒服（"${elderInput ?? ""}"）。\n请温和地表达关心，建议联系家人或就医，然后结束通话。\n如“哎呀，${callName}先坐着休息一下，我这就帮${callName}告诉${caregiverName}，让她来看看${callName}哦~”。\n语气要关切，不要慌张。`,
    // closing: 只在长辈明确表达要结束时才进本阶段，避免“好的/方便”被误推后念念出“不打扰您”
    closing: `${base}\n\n当前任务：温暖收尾。\n仅在${callName}明确表达要结束通话（如“再见”“挂了”“没事了”“行了”）后才进本阶段。\n不要说“那我先不打扰您啦”，用开放式收尾。\n如“那${callName}好好休息，我跟${caregiverName}说一声${callName}一切都好~”`,
    ended: `${base}\n\n通话已结束。`,
  };

  return (instructions[stage] ?? instructions.closing) + JSON_FORMAT_SUFFIX;
}

// ── 称谓后校验（仅作用于 assistant→elder 回复） ───────────────────────────

// ── 后处理：禁用「您/您呀/喂/我是您的小宝贝」三类语气 ───────────────────────
// LLM 可能偶尔吐出硬约束以外的错误风格，这里全量兑底：

function sanitizeHonorifics(
  reply: string,
  elder: LockedElderContext,
): string {
  const callName = elder.callName;
  let result = reply;

  // 1. 删除句首「喂」+ 可选标点
  result = result.replace(/^喂[，,。！!~～\s]+/, "");

  // 2. 「我是您的小宝贝/小棉袄/小天使」→ 替换为「我是念念小助理」
  result = result.replace(/我是您的?(小宝贝|小棉袄|小天使|小心肝)/g, "我是念念小助理");
  result = result.replace(/我是您的?(小)宝贝/g, "我是念念小助理");

  // 3. 「您呀」→ 换为 ${callName}呀
  result = result.replaceAll("您呀", `${callName}呀`);

  // 4. 所有「您」→ 替换为 ${callName}
  // （这是 LLM 偶尔走样的兑底；prompt 已强调严禁使用）
  result = result.replaceAll("您", callName);

  // 单字称谓兑底：处理“称谓+呀”在句首的情况（如“妈呀”→“${callName}呀”）
  const riskyNames = [elder.displayName, elder.relation, ...elder.nicknames]
    .filter(n => n && n.length === 1);
  for (const name of riskyNames) {
    const escName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`^${escName}呀`), `${callName}呀`);
    result = result.replace(new RegExp(`^${escName}，`), `${callName}，`);
  }

  return result.trim();
}

// ── LLM 输出容错解析 ─────────────────────────────────────────────────────────

/**
 * 从 LLM 输出文本中解析 reply 字段。四层兜底：
 * 1. 剥离 ```json ... ``` markdown 包裹
 * 2. 直接 JSON.parse（DeepSeek jsonMode 严格遵守时）
 * 3. regex 提取 "reply" : "..."（双引号）
 * 4. regex 提取 'reply' : '...'（单引号变体）
 * 全部失败返回空字符串（调用方走 getFallbackResponse）
 */
function parseReplyFromLLM(rawText: string): string {
  if (!rawText?.trim()) return "";

  let cleaned = rawText.trim();

  // 1. 剥离 markdown 包裹：```json ... ``` 或 ``` ...
  const fencedMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  if (fencedMatch) {
    cleaned = fencedMatch[1].trim();
  }

  // 2. 直接 JSON.parse
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.reply === "string") {
      return parsed.reply.trim();
    }
  } catch {
    // fallthrough to regex
  }

  // 3. 双引号 regex 兜底："reply" : "..."（用 [\s\S] 代替 /s 以兼容 ES2018 以下）
  const replyMatch = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) {
    return replyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
  }

  // 4. 单引号变体兜底：'reply' : '...'
  const singleQuoteMatch = cleaned.match(/'reply'\s*:\s*'((?:[^'\\]|\\.)*)'/);
  if (singleQuoteMatch) {
    return singleQuoteMatch[1].replace(/\\'/g, "'").replace(/\\n/g, "\n").trim();
  }

  // 全部解析失败 → 返回空字符串（调用方走 getFallbackResponse）
  console.warn("[parseReplyFromLLM] 无法解析 LLM 输出", {
    rawLength: rawText?.length ?? 0,
    rawPreview: rawText?.slice(0, 200) ?? "",
    cleanedPreview: cleaned.slice(0, 200),
  });
  return "";
}

// ── Fallback responses ─────────────────────────────────────────────────

function getFallbackGreeting(elder: LockedElderContext, caregiverName: string): string {
  const callName = elder.callName;
  return `哈喽${callName}~我是${caregiverName}设置的小助理念念，${caregiverName}让我来跟${callName}聊几句，这会儿方便吗？`;
}

function getFallbackResponse(
  session: CallSessionState,
  classified?: ClassifiedIntent,
  stage?: CallStage,
  elderInput?: string,
): string {
  const input = (elderInput ?? "").trim();
  const callName = session.elder.callName;
  const caregiverName = session.caregiverName;
  const intent = classified?.intent ?? "unknown";
  const captured = classified?.capturedValue;

  // ── 阶段 + 意图感知兜底：回复必须与 elder input 相关，不能吐任务套话 ──

  if (stage === "greeting") {
    return `哈喽${callName}~我是${caregiverName}设置的小助理念念，${caregiverName}让我来跟${callName}聊几句，这会儿方便吗？`;
  }

  if (stage === "warm_chat") {
    // T0 修复：避免“身体都好吗”无煺循环 → 使用 3 轮动态台词池，进到第 3 轮主动推进话术
    const turns = session.turnsInStage;
    if (input) {
      const isPositive = /好|行|可以|不错|挺好|没事/.test(input);
      if (turns === 0) {
        return isPositive
          ? `听${callName}这么说我就放心啦~${callName}最近身体都好吧？`
          : `嗯嗯，收到啦~${callName}最近身体都好吧？有没有哪里不太舒服的？`;
      }
      if (turns === 1) {
        return isPositive
          ? `太棒啦~那${callName}今天都干嘛了呀？`
          : `嗯嗯，我听着呢~${callName}慢慢说~`;
      }
      // turns >= 2：主动拉进任务（不赊代 LLM，跳出循环）
      return isPositive
        ? `听着${callName}一切都不错呀~那${callName}今天还记得做件事哈~`
        : `好的${callName}，那${callName}这边也帮我个忙哈~`;
    }
    return `${callName}最近身体都好吧？有没有哪里不太舒服的？`;
  }

  if (stage === "task_reminder" || stage === "task_followup") {
    // 根据意图给出针对性兜底（不再吐"记得按时吃药"这种与输入无关的套话）
    switch (intent) {
      case "confirmed":
        return `好的呀，记下来啦~${callName}记得跟${caregiverName}说一声哦~`;
      case "denied":
        return `没事没事~${callName}别有压力，下次记得就好，需要帮忙随时跟我说呀~`;
      case "postponed":
        return `好的好的，等会儿吃也行~吃完记得跟${caregiverName}说一声哦~`;
      case "needs_help":
        return `哎呀${callName}别着急，我帮${callName}跟${caregiverName}说一声，让她来帮${callName}~`;
      case "measurement_value":
        return `好的，记下${captured ?? input}啦~我会告诉${caregiverName}的~`;
      case "health_abnormal":
        return `哎呀${callName}，先坐着休息一下，我这就去告诉${caregiverName}，让她看看${callName}哦~`;
      case "confused":
        return `${callName}，我慢慢说哈，刚才没听清没关系~`;
      case "identity_question":
        return `哎呀我是${caregiverName}设置的小助理念念呀，专门帮${caregiverName}关心${callName}的~`;
      case "relay_message":
        return `好的好的，${callName}说的"${classified?.relayContent ?? input}"我一定带给${caregiverName}~`;
      case "end_requested":
        return `好的，那今天先聊到这儿~${callName}注意身体，${caregiverName}惦记${callName}~`;
      default:
        // off_topic / unknown：把用户的原话 echo 回去，体现"我在听"
        if (input) {
          return `嗯嗯，我听到${callName}说"${input}"啦~我帮${callName}记下来哦~`;
        }
        return `${callName}今天情况怎么样呀？跟我说说呗~`;
    }
  }

  if (stage === "relay") {
    if (intent === "relay_message" && classified?.relayContent) {
      return `好的好的，${callName}说的"${classified.relayContent}"我一定带给${caregiverName}~`;
    }
    if (input) {
      return `嗯嗯，${callName}刚才说的我记下来啦~还有别的想带给${caregiverName}的吗？`;
    }
    return `那${callName}有没有什么话想带给${caregiverName}呀？`;
  }

  if (stage === "escalation") {
    return `哎呀${callName}，先坐着休息一下，我这就去告诉${caregiverName}，让她来看看${callName}哦~`;
  }

  if (stage === "closing" || stage === "ended") {
    return `好的，那今天先聊到这儿~${callName}注意身体，${caregiverName}惦记${callName}哦~`;
  }

  // 兜底中的兜底：echo 用户原话，至少证明"我在听"
  if (input) {
    return `嗯嗯，我听到${callName}说"${input}"啦~`;
  }
  return `嗯嗯，我听着呢~`;
}

// ── Main handler ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // --- v2 Workflow 分支（仅处理 continue 动作，start 仍走 v1）---
    if (isV2Enabled("call") && action === "continue") {
      const { sessionId, elderInput } = body as {
        sessionId?: string;
        elderInput?: string;
      };

      if (sessionId && elderInput !== undefined) {
        try {
          const session = callSessionService.load(sessionId);
          if (session) {
            const v2Result = await v2ProcessTurn({
              sessionId,
              elderUtterance: elderInput,
              elderId: session.elderId,
              caregiverId: session.caregiverId,
            });

            return NextResponse.json({
              sessionId,
              reply: v2Result.content,
              stage: (v2Result.data?.analysis as any)?.next_stage ?? "task_reminder",
              intent: "unknown",
              intentConfidence: 0,
              intentEvidence: "",
              shouldEndCall: Boolean(v2Result.data?.isCallEnding),
              outcome: null,
              capturedTaskStatus: { status: "unknown", note: "" },
              healthAlert: false,
              relayMessage: null,
              meta: { v2: true },
            });
          }
        } catch (v2Error) {
          if (shouldFallbackToV1(v2Error, "call")) {
            // fall through to v1 below
          } else {
            throw v2Error;
          }
        }
      }
    }

    if (action === "start") {
      return await handleStart(body);
    } else if (action === "continue") {
      return await handleContinue(body);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    console.error("[elder-call-conversation] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── Start handler ───────────────────────────────────────────────────────

async function handleStart(body: Record<string, unknown>) {
  const { elderId, taskOccurrenceId, caregiverId, relayMessage } = body as {
    elderId?: string;
    taskOccurrenceId?: string;
    caregiverId?: string;
    relayMessage?: string;
  };

  if (!elderId) {
    return NextResponse.json({ error: "Missing elderId." }, { status: 400 });
  }

  // 服务端查库锁定 elder 上下文
  const elderRecord = store.getElder(elderId);
  if (!elderRecord) {
    return NextResponse.json({ error: "Elder not found." }, { status: 404 });
  }

  // 构建 LockedElderContext
  const elder: LockedElderContext = {
    elderId: elderRecord.id,
    displayName: elderRecord.displayName,
    callName: elderRecord.displayName,
    relation: elderRecord.relation,
    nicknames: elderRecord.nicknames ?? [],
    healthFocus: elderRecord.healthFocus ?? [],
    communicationPreference: elderRecord.communicationPreference ?? [],
    responseHabit: elderRecord.responseHabit ?? "",
    personalityTraits: (elderRecord as Record<string, unknown>).personalityTraits as string[] ?? [],
    recentSignals: (elderRecord as Record<string, unknown>).recentSignals as string[] ?? [],
    oneLinePortrait: (elderRecord as Record<string, unknown>).oneLinePortrait as string ?? "",
  };

  // 查库获取 task（如果传了 taskOccurrenceId）
  let task: TaskContext = null;
  if (taskOccurrenceId) {
    const occ = store.getTaskOccurrence(taskOccurrenceId as string);
    if (occ) {
      // 从 template 获取 task 信息
      const template = store.getTaskTemplate(occ.taskTemplateId);
      if (template) {
        // 归属检查
        if (template.elderId !== elderId) {
          return NextResponse.json({ error: "Task does not belong to this elder." }, { status: 400 });
        }
        const primaryObj = template.primaryObjectives?.[0];
        task = {
          id: occ.id,
          type: primaryObj?.type ?? "other",
          content: primaryObj?.content ?? template.title,
          elderDisplayName: elderRecord.displayName,
          elderId: elderId,
        };
      }
    }
  }

  const caregiverName = caregiverId ? (store.getCaregiver(caregiverId as string)?.displayName ?? "小雨") : "小雨";
  const reformulatedTask = task ? reformulateTaskForCall(task.content, elder, caregiverName) : "";

  // 创建 session
  const sessionId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: CallSessionState = {
    sessionId,
    elderId,
    elder,
    task,
    reformulatedTask,
    caregiverName,
    relayMessage: relayMessage as string | undefined,
    stage: "greeting",
    turnsInStage: 0,
    totalTurns: 0,
    consecutiveConfusedCount: 0,
    history: [],
    createdAt: Date.now(),
  };

  await sessionStore.set(sessionId, session);

  // LLM 生成开场白
  let reply = "";
  try {
    const instruction = buildStageInstruction("greeting", session);
    const messages: ChatMessage[] = [
      { role: "system", content: instruction },
      { role: "system", content: `现在电话刚刚接通。请开始第一轮对话。\n你要先自我介绍，然后问${elder.callName}是否方便聊几句。\n只说一两句话就够了，说完等回应。` },
    ];

    const rawJson = await callLLMJson(messages, { temperature: 0.6, maxTokens: 200 });
    reply = parseReplyFromLLM(rawJson);
  } catch {
    reply = getFallbackGreeting(elder, caregiverName);
  }

  // 称谓后校验（仅 assistant→elder）
  if (reply) {
    reply = sanitizeHonorifics(reply, elder);
  }
  if (!reply) {
    reply = getFallbackGreeting(elder, caregiverName);
  }

  // 更新 history
  session.history.push({ role: "assistant", text: reply });
  session.turnsInStage++;
  session.totalTurns++;
  await sessionStore.set(sessionId, session);

  return NextResponse.json({
    sessionId,
    reply,
    stage: "greeting",
    shouldEndCall: false,
  });
}

// ── Continue handler ─────────────────────────────────────────────────────

async function handleContinue(body: Record<string, unknown>) {
  const { sessionId, elderInput, asrConfidence } = body as {
    sessionId?: string;
    elderInput?: string;
    asrConfidence?: number;
  };

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  // 从 SessionStore 加载 Session
  const session = await sessionStore.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 410 });
  }

  const { elder, stage, caregiverName } = session;
  const input = elderInput as string ?? "";

  // ASR 置信度过低 → 不推进阶段，请长辈重复
  if (asrConfidence !== undefined && asrConfidence < 0.5) {
    const reply = "我刚才没太听清，您是说……吗？能再说一遍吗~";
    session.history.push({ role: "elder", text: input });
    session.history.push({ role: "assistant", text: reply });
    session.totalTurns++;
    await sessionStore.set(sessionId, session);
    return NextResponse.json({
      sessionId,
      reply,
      stage,
      shouldEndCall: false,
    });
  }

  // 记录长辈输入
  session.history.push({ role: "elder", text: input });

  // 意图分类
  const classified = classifyIntent(input, stage, caregiverName);

  // 更新 consecutiveConfusedCount
  if (classified.intent === "confused" || classified.intent === "identity_question") {
    session.consecutiveConfusedCount++;
  } else {
    session.consecutiveConfusedCount = 0;
  }

  // 捕获 relay message
  if (classified.intent === "relay_message" && classified.relayContent) {
    session.relayMessage = classified.relayContent;
  }

  // 状态机推进（T0 修复：传 input 让 advanceStage 能识别“明确动作词” vs “应付”）
  const { nextStage, shouldEndCall, outcome } = advanceStage(session, classified, input);

  // 更新 session 状态
  if (nextStage !== stage) {
    session.stage = nextStage;
    session.turnsInStage = 1;
  } else {
    session.turnsInStage++;
  }
  session.totalTurns++;

  // 设置 outcome（如果有）
  if (outcome) {
    session.outcome = outcome;
  }

  // 捕获任务状态
  const capturedTaskStatus = captureTaskStatus(classified);

  // LLM 生成回复
  let reply = "";
  try {
    const instruction = buildStageInstruction(nextStage, session, input);
    const messages: ChatMessage[] = [
      { role: "system", content: instruction },
    ];

    // 添加最近 5 轮对话历史（精简上下文）
    const recentHistory = session.history.slice(-10);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role === "elder" ? "user" : "assistant",
        content: turn.role === "elder" ? `${elder.callName}：${turn.text}` : turn.text,
      });
    }

    const rawJson = await callLLMJson(messages, { temperature: 0.6, maxTokens: 200 });
    reply = parseReplyFromLLM(rawJson);
  } catch {
    // 兑底调用传完整上下文，避免「驴唇不对马嘴」
    reply = getFallbackResponse(session, classified, nextStage, input);
  }

  // 称谓后校验（仅 assistant→elder，不碰 relay message）
  if (reply) {
    reply = sanitizeHonorifics(reply, elder);
  }
  if (!reply) {
    // T0 修复：兑底调用传完整上下文，否则永远命中 line 642 “嗯嗯，我听着呢~” 让用户觉得“循环”
    console.warn("[elder-call-conversation] LLM 回复为空，进入完整上下文兑底", {
      sessionId,
      stage: nextStage,
      intent: classified.intent,
      elderInput: input,
    });
    reply = getFallbackResponse(session, classified, nextStage, input);
  }

  // 安全检查（原有 safety-guard）
  const safetyResult = runSafetyCheck(reply);
  reply = safetyResult.sanitized.trim();

  // 更新 history
  session.history.push({ role: "assistant", text: reply });
  await sessionStore.set(sessionId, session);

  return NextResponse.json({
    sessionId,
    reply,
    stage: nextStage,
    intent: classified.intent,
    intentConfidence: classified.confidence,
    intentEvidence: classified.evidence,
    shouldEndCall,
    outcome: session.outcome ?? null,
    capturedTaskStatus,
    healthAlert: classified.healthAlert ?? false,
    relayMessage: session.relayMessage ?? null,
  });
}
