/**
 * Safety Guard - rule-based safety checks for Agent outputs.
 * Does NOT use LLM. Uses two-layer pattern matching:
 *   Layer 1 (strong ban): direct diagnosis conclusions, impersonation, etc.
 *   Layer 2 (safe pass): allow cautious expressions like "不能判断", "建议评估"
 */

type SafetyViolation = {
  type: string;
  matchedPattern: string;
  severity: "block" | "warn";
  suggestion?: string;
};

export type SafetyCheckResult = {
  safe: boolean;
  severity: "low" | "medium" | "high";
  violations: { type: string; evidence: string }[];
  repairedReply?: string;
};

// =====================================================================
// Layer 1: Strong ban patterns - always blocked
// =====================================================================

// Patterns that indicate the agent is impersonating the child
const IMPERSONATION_PATTERNS = [
  /^我是(小雨|小明|小华).{0,4}[,，。]/,
  /我是你的(孙女|孙子|女儿|儿子|外孙)/,
];

// Patterns that indicate medical advice
const MEDICAL_ADVICE_PATTERNS = [
  /你这个(症状|情况|病)(没事|不要紧|正常|不严重)/,
  /你(应该|必须|需要)(吃|服用|停|加).{0,6}(片|粒|mg|ml)/,
  /这个药(可以停|不用吃|没问题)/,
  /建议你(吃|服用|换|停)/,
  /你这个血压(正常|没事|没问题)/,
];

// Patterns that blame or guilt-trip the elder
const BLAME_PATTERNS = [
  /你怎么又(忘|没|不)/,
  /你必须(马上|立刻|赶紧)/,
  /你不(吃药|做).{0,8}(孩子|家人).{0,6}(会|就)(难过|担心|伤心|生气)/,
  /你就是不(听话|注意)/,
];

// Patterns that create guilt for the caregiver
const CAREGIVER_GUILT_PATTERNS = [
  /(孩子|子女)(太|好)(辛苦|累|忙).{0,6}你(别|不要|不能)/,
  /你应该(体谅|理解)(孩子|子女)/,
];

// NEW: Direct diagnosis conclusions (strong ban)
const DIAGNOSIS_PATTERNS = [
  /(你妈妈|她|你爸|他)(就是|应该是|肯定是|得了)(老年痴呆|阿尔茨海默|认知障碍|痴呆症)/,
  /(这个|这种)(症状|情况)(就是|肯定是|说明)(老年痴呆|阿尔茨海默|认知障碍)/,
  /(你妈妈|她|你爸|他)(已经|明显)(痴呆|痴呆了)/,
];

// NEW: Medical guarantee
const MEDICAL_GUARANTEE_PATTERNS = [
  /(这个|吃了|用了)(肯定|一定|保证)(能好|没事|治好|痊愈)/,
  /(不用|不需要)(担心|害怕|去医院|看医生)/,
];

// NEW: Extracting sensitive info
const SENSITIVE_EXTRACTION_PATTERNS = [
  /你(家|的)(存折|存款|银行卡|密码|退休金|工资).*(多少|是多少)/,
];

// =====================================================================
// Layer 2: Safe expression pass-through
// =====================================================================

// These patterns indicate safe, cautious expressions that should NOT be blocked
const SAFE_EXPRESSION_PATTERNS = [
  /(不能判断|不确定|不好说|很难判断|不能确定)/,
  /(值得记录|值得关注|建议.*评估|建议.*看看)/,
  /(我帮您|我帮你)(记下来|记录|留意)/,
  /(可能|也许|或许)(需要|可以|建议)/,
  /(我不是医生|我不是专业的|具体还是要).{0,4}(所以|建议|看看)/,
];

export function sanitizeAssistantReply(reply: string): {
  safe: boolean;
  sanitized: string;
  violations: SafetyViolation[];
} {
  const violations: SafetyViolation[] = [];

  // Check impersonation
  for (const pattern of IMPERSONATION_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "impersonation",
        matchedPattern: pattern.source,
        severity: "block",
        suggestion: "应说明自己是'念念'，而不是子女本人。",
      });
    }
  }

  // Check medical advice
  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "medical_advice",
        matchedPattern: pattern.source,
        severity: "block",
        suggestion: "不得提供医疗诊断或用药建议。建议联系家人或医生。",
      });
    }
  }

  // Check blame
  for (const pattern of BLAME_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "blame_elder",
        matchedPattern: pattern.source,
        severity: "block",
        suggestion: "不得责备长辈或使用命令式语气。",
      });
    }
  }

  // Check caregiver guilt
  for (const pattern of CAREGIVER_GUILT_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "caregiver_guilt",
        matchedPattern: pattern.source,
        severity: "warn",
        suggestion: "不要制造愧疚感。",
      });
    }
  }

  // NEW: Check diagnosis conclusions
  for (const pattern of DIAGNOSIS_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "diagnosis",
        matchedPattern: pattern.source,
        severity: "block",
        suggestion: "不得直接下诊断结论。应建议联系医生。",
      });
    }
  }

  // NEW: Check medical guarantee
  for (const pattern of MEDICAL_GUARANTEE_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "medical_guarantee",
        matchedPattern: pattern.source,
        severity: "block",
        suggestion: "不得保证治疗效果或阻止就医。",
      });
    }
  }

  // NEW: Check sensitive info extraction
  for (const pattern of SENSITIVE_EXTRACTION_PATTERNS) {
    if (pattern.test(reply)) {
      violations.push({
        type: "sensitive_extraction",
        matchedPattern: pattern.source,
        severity: "block",
        suggestion: "不得询问财务或敏感个人信息。",
      });
    }
  }

  // If there are block-level violations, replace problematic content
  let sanitized = reply;
  const blockViolations = violations.filter((v) => v.severity === "block");

  if (blockViolations.length > 0) {
    // For impersonation, replace "我是X" with "我是X设置的念念"
    sanitized = sanitized.replace(
      /我是(\w{1,3})([,，。]|$)/,
      "我是$1设置的念念$2"
    );

    // For medical advice, neutralize
    sanitized = sanitized.replace(
      /你这个(症状|情况)(没事|不要紧|正常)/,
      "我帮您记下来，也会告诉家人"
    );

    // For blame, soften
    sanitized = sanitized.replace(
      /你怎么又(忘|没)/,
      "提醒您一下"
    );

    // If still contains blocked patterns after sanitization, use generic safe reply
    const stillBlocked = blockViolations.some((v) =>
      new RegExp(v.matchedPattern).test(sanitized)
    );
    if (stillBlocked) {
      sanitized = "好，我都记下来了。您注意休息，我一会儿就告诉家人。";
    }
  }

  return {
    safe: blockViolations.length === 0,
    sanitized,
    violations,
  };
}

export function sanitizeCareInsight(insight: {
  factualSummary: string;
  relationshipInsight: string;
  suggestedAction: string;
  suggestedMessage: string;
}): typeof insight {
  // Check suggested message doesn't blame or command
  const msgResult = sanitizeAssistantReply(insight.suggestedMessage);
  return {
    ...insight,
    suggestedMessage: msgResult.sanitized,
  };
}

/**
 * Two-layer safety check:
 * Layer 1: Block strong violations (diagnosis, impersonation, etc.)
 * Layer 2: Allow safe cautious expressions ("不确定", "建议评估")
 * Returns SafetyCheckResult with severity and optional repaired reply.
 */
export function checkSafety(reply: string): SafetyCheckResult {
  // Layer 2: If reply contains safe expression patterns, it's likely OK
  const hasSafeExpression = SAFE_EXPRESSION_PATTERNS.some((p) => p.test(reply));

  // Layer 1: Run all block-level checks
  const result = sanitizeAssistantReply(reply);
  const blockViolations = result.violations.filter((v) => v.severity === "block");

  // If we have violations but also safe expressions, downgrade diagnosis-type violations
  if (hasSafeExpression && blockViolations.length > 0) {
    const nonDiagnosisViolations = blockViolations.filter(
      (v) => v.type !== "diagnosis"
    );
    if (nonDiagnosisViolations.length === 0) {
      // Only diagnosis violations were present, and safe expression was used → pass
      return {
        safe: true,
        severity: "low",
        violations: [],
      };
    }
  }

  const severity: SafetyCheckResult["severity"] = blockViolations.length === 0
    ? "low"
    : blockViolations.some((v) => v.type === "diagnosis" || v.type === "medical_guarantee")
      ? "high"
      : "medium";

  return {
    safe: blockViolations.length === 0,
    severity,
    violations: blockViolations.map((v) => ({
      type: v.type,
      evidence: v.matchedPattern,
    })),
    repairedReply: result.safe ? undefined : result.sanitized,
  };
}

/**
 * Check structured output constraints from TurnPlanner.
 * E.g., if action is ask_health_question but health budget is 0, reject.
 */
export function checkStructuredOutput(turn: {
  next?: { action?: string };
  statePatch?: {
    probeBudget?: { healthRemaining?: number; totalRemaining?: number };
  };
}): SafetyCheckResult {
  const violations: { type: string; evidence: string }[] = [];

  if (turn.next?.action === "ask_health_question") {
    const healthBudget = turn.statePatch?.probeBudget?.healthRemaining;
    if (healthBudget !== undefined && healthBudget <= 0) {
      violations.push({
        type: "budget_exceeded",
        evidence: "ask_health_question but healthRemaining=0",
      });
    }
  }

  if (turn.next?.action?.startsWith("ask_") || turn.next?.action?.startsWith("probe_")) {
    const totalBudget = turn.statePatch?.probeBudget?.totalRemaining;
    if (totalBudget !== undefined && totalBudget <= 0) {
      violations.push({
        type: "probe_budget_exhausted",
        evidence: "probe action but totalRemaining=0",
      });
    }
  }

  return {
    safe: violations.length === 0,
    severity: violations.length === 0 ? "low" : "medium",
    violations,
  };
}
