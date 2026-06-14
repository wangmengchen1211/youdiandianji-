// =====================================================================
// v2.1 Turn Intent Classifier — LLM 意图识别
// Step 1: UnderstandTurn
// 先检测否定词（快速预筛），再调用 LLM 做语义理解
// =====================================================================
import { TurnIntentSchema, type TurnIntentOutput } from "../schemas/turn-intent.schema";
import { buildTurnIntentPrompt } from "../prompts/turn-intent-classifier.prompt";
import { generateStructuredOutput } from "../services/llm.service";

// 否定词列表（用于快速预筛）
const NEGATION_KEYWORDS = ["不", "没", "别", "无需", "不用", "不要"];

// 情绪关键词列表（用于快速预筛）
const EMOTION_KEYWORDS = [
  "想", "担心", "怕", "难过", "孤单", "不开心", "累",
  "算了", "不想", "没什么", "你们忙", "没事", "不用管",
];

const FALLBACK: TurnIntentOutput = {
  intent: "unknown",
  confidence: 0.3,
  evidence: "LLM 调用失败，fallback",
  negation_detected: false,
  emotion_detected: false,
  length_category: "medium",
  factual_info: {},
  task_slots: {},
  emotion_label: "neutral",
};

/**
 * 快速预筛：检测否定词
 */
function detectNegation(text: string): boolean {
  return NEGATION_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * 快速预筛：检测情绪
 */
function detectEmotion(text: string): boolean {
  return EMOTION_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * 长度分类
 */
function classifyLength(text: string): "short" | "medium" | "long" {
  const len = text.trim().length;
  if (len <= 5) return "short";
  if (len <= 30) return "medium";
  return "long";
}

/**
 * 规则层快速判断（高置信度场景直接返回，不调 LLM）
 */
function tryRuleBasedIntent(text: string): TurnIntentOutput | null {
  const normalized = text.trim();

  // "不方便" — 必须在"方便"之前检测否定
  if (
    normalized.includes("不方便") ||
    normalized.includes("现在忙") ||
    normalized.includes("不想聊") ||
    normalized.includes("挂了吧") ||
    normalized.includes("没什么好聊")
  ) {
    return {
      intent: "end_requested",
      confidence: 0.95,
      evidence: `规则匹配: 检测到拒绝信号 "${normalized}"`,
      negation_detected: true,
      emotion_detected: false,
      length_category: classifyLength(normalized),
      factual_info: {},
      task_slots: {},
      emotion_label: "reluctant",
    };
  }

  // "方便" — 单独出现（无否定词前缀）
  if (
    (normalized.includes("方便") || normalized.includes("可以") || normalized.includes("有空")) &&
    !detectNegation(normalized)
  ) {
    return {
      intent: "available_to_talk",
      confidence: 0.9,
      evidence: `规则匹配: 长辈表示有空 "${normalized}"`,
      negation_detected: false,
      emotion_detected: false,
      length_category: classifyLength(normalized),
      factual_info: {},
      task_slots: {},
      emotion_label: "neutral",
    };
  }

  // 身份问询
  if (
    normalized.includes("你是谁") ||
    normalized.includes("哪位") ||
    normalized.includes("你是哪") ||
    normalized.includes("你是小雨")
  ) {
    return {
      intent: "identity_question",
      confidence: 0.9,
      evidence: `规则匹配: 身份问询 "${normalized}"`,
      negation_detected: false,
      emotion_detected: false,
      length_category: classifyLength(normalized),
      factual_info: {},
      task_slots: {},
      emotion_label: "curious",
    };
  }

  // 规则层无法确定，返回 null 走 LLM
  return null;
}

/**
 * 意图识别主函数
 * 优先规则层 → LLM 语义理解
 */
export async function classifyTurnIntent(params: {
  elderUtterance: string;
  currentStage: string;
  taskContext: string;
  caregiverDisplayName: string;
  elderDisplayName: string;
}): Promise<TurnIntentOutput> {
  const {
    elderUtterance,
    currentStage,
    taskContext,
    caregiverDisplayName,
    elderDisplayName,
  } = params;

  // Step 1a: 规则层快速判断
  const ruleResult = tryRuleBasedIntent(elderUtterance);
  if (ruleResult) {
    return ruleResult;
  }

  // Step 1b: LLM 语义理解
  const prompt = buildTurnIntentPrompt({
    elder_utterance: elderUtterance,
    current_stage: currentStage,
    task_context: taskContext,
    caregiver_display_name: caregiverDisplayName,
    elder_display_name: elderDisplayName,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: TurnIntentSchema,
    input: { elder_utterance: elderUtterance },
    fallback: {
      ...FALLBACK,
      negation_detected: detectNegation(elderUtterance),
      emotion_detected: detectEmotion(elderUtterance),
      length_category: classifyLength(elderUtterance),
    },
    agentName: "TurnIntentClassifier",
    temperature: 0.1, // 低温度：意图分类需要确定性
    maxRetries: 1,
  });

  return data;
}
