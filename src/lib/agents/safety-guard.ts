/**
 * Safety Guard - rule-based safety checks for Agent outputs.
 * Does NOT use LLM. Uses pattern matching to detect violations.
 */

type SafetyViolation = {
  type: string;
  matchedPattern: string;
  severity: "block" | "warn";
  suggestion?: string;
};

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
        suggestion: "应说明自己是'小助理'，而不是子女本人。",
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

  // If there are block-level violations, replace problematic content
  let sanitized = reply;
  const blockViolations = violations.filter((v) => v.severity === "block");

  if (blockViolations.length > 0) {
    // For impersonation, replace "我是X" with "我是X设置的小助理"
    sanitized = sanitized.replace(
      /我是(\w{1,3})([,，。]|$)/,
      "我是$1设置的小助理$2"
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
