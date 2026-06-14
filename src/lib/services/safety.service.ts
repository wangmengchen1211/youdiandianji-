// =====================================================================
// v2 Safety Service — 三层安全
// preCheck（规则初筛）→ mergePolicy（合并规则+LLM语义）→ postCheck（输出检查）
// 基于现有 safety-guard.ts 的规则能力
// =====================================================================
import {
  checkSafety,
  sanitizeAssistantReply,
  checkStructuredOutput,
  type SafetyCheckResult,
} from "../agents/safety-guard";
import type { SafetyPolicy, RiskLevel } from "../store/types";

// --- 规则初筛结果 ---
export type PreCheckResult = {
  riskLevel: RiskLevel;
  safetyPolicy: SafetyPolicy[];
  mustInclude: string[];
  mustAvoid: string[];
};

// --- postCheck 结果 ---
export type PostCheckResult = {
  action: "allow" | "sanitize" | "block";
  sanitizedText: string;
  severity: "low" | "medium" | "high";
  violations: { type: string; evidence: string }[];
};

// --- 关键词 → 安全策略映射（规则层）---
const RULE_POLICY_MAP: Record<string, SafetyPolicy[]> = {
  "痴呆|老年痴呆|认知|忘事|记忆|阿尔茨海默": ["cognitive_careful", "medical_no_diagnosis"],
  "血压|血糖|吃药|服药|剂量|医院|医生|症状": ["medical_no_diagnosis", "medical_no_dosage"],
  "冒充|我是你|妈.*我是|女儿.*我": ["no_impersonation"],
  "存折|存款|银行|密码|退休金|工资": ["no_sensitive_extraction"],
};

/**
 * 规则层初筛：根据输入文本匹配安全策略
 */
export function preCheck(
  input: string,
  _context?: Record<string, unknown>
): PreCheckResult {
  const policies: Set<SafetyPolicy> = new Set(["general_safe"]);
  const mustAvoid: string[] = [];
  const mustInclude: string[] = [];
  let riskLevel: RiskLevel = "low";

  for (const [pattern, matchedPolicies] of Object.entries(RULE_POLICY_MAP)) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(input)) {
      matchedPolicies.forEach((p) => policies.add(p));
      riskLevel = riskLevel === "low" ? "medium" : riskLevel;
    }
  }

  // 特定策略追加约束
  if (policies.has("medical_no_diagnosis")) {
    mustAvoid.push("诊断结论", "疾病名称判断", "治疗保证");
    mustInclude.push("建议联系医生或家人");
  }
  if (policies.has("no_impersonation")) {
    mustAvoid.push("冒充子女身份");
    mustInclude.push("说明自己是念念");
  }
  if (policies.has("cognitive_careful")) {
    mustAvoid.push("直接认知衰退结论");
    riskLevel = "medium_high";
  }

  return {
    riskLevel,
    safetyPolicy: Array.from(policies),
    mustInclude,
    mustAvoid,
  };
}

/**
 * 合并规则层 + LLM 语义层的 safety_policy，取并集
 */
export function mergePolicy(
  preCheckPolicies: SafetyPolicy[],
  classifierPolicies: SafetyPolicy[]
): SafetyPolicy[] {
  const merged = new Set<SafetyPolicy>([...preCheckPolicies, ...classifierPolicies]);
  // 确保至少有 general_safe
  merged.add("general_safe");
  return Array.from(merged);
}

/**
 * 生成 prompt 注入约束数组
 * 所有 Cognitive Skill 调用前必须执行此函数
 */
export function policyConstraint(policy: SafetyPolicy[]): string[] {
  const constraints: string[] = [];

  if (policy.includes("medical_no_diagnosis")) {
    constraints.push("禁止输出任何医疗诊断结论");
    constraints.push("禁止判断疾病名称");
  }
  if (policy.includes("medical_no_dosage")) {
    constraints.push("禁止输出具体药物剂量");
    constraints.push("禁止建议增减药物");
  }
  if (policy.includes("cognitive_careful")) {
    constraints.push("禁止直接说'是老年痴呆'或'认知障碍'");
    constraints.push("使用'值得记录'、'建议评估'等谨慎表达");
  }
  if (policy.includes("no_impersonation")) {
    constraints.push("禁止冒充子女本人");
    constraints.push("必须说'我是XX设置的念念'");
  }
  if (policy.includes("no_blame_no_guilt")) {
    constraints.push("禁止责备长辈或制造愧疚感");
  }
  if (policy.includes("no_sensitive_extraction")) {
    constraints.push("禁止询问财务或敏感个人信息");
  }

  return constraints;
}

/**
 * 输出检查：allow / sanitize / block
 * 基于现有 safety-guard.ts 的规则匹配
 */
export function postCheck(output: string): PostCheckResult {
  const result = checkSafety(output);

  if (result.safe) {
    return {
      action: "allow",
      sanitizedText: output,
      severity: "low",
      violations: [],
    };
  }

  // 尝试修复
  const sanitizeResult = sanitizeAssistantReply(output);
  if (sanitizeResult.safe || result.severity === "medium") {
    return {
      action: "sanitize",
      sanitizedText: sanitizeResult.sanitized,
      severity: result.severity,
      violations: result.violations,
    };
  }

  // 高风险 → block
  return {
    action: "block",
    sanitizedText: "好，我都记下来了。您注意休息，我一会儿就告诉家人。",
    severity: "high",
    violations: result.violations,
  };
}

/**
 * 检查结构化输出的约束（如 probe budget）
 */
export function checkStructuredConstraints(turn: {
  next?: { action?: string };
  statePatch?: {
    probeBudget?: { healthRemaining?: number; totalRemaining?: number };
  };
}): SafetyCheckResult {
  return checkStructuredOutput(turn);
}
