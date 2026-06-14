// =====================================================================
// v2 Post-call Extractor Prompt
// 基于 response-understanding，通话后权威提取器
// 合并 task_result + risk_signals + relay_message + memory + care_insight
// =====================================================================

export function buildPostCallExtractorPrompt(params: {
  family_context: string;
  safety_policy: string[];
  policy_constraints: string[];
  transcript: string;
  call_state: Record<string, unknown>;
  task_template?: Record<string, unknown> | null;
}): string {
  const {
    family_context,
    safety_policy,
    policy_constraints,
    transcript,
    call_state,
    task_template,
  } = params;

  const taskBlock = task_template
    ? `\n任务模板：\n${JSON.stringify(task_template, null, 2)}\n`
    : "";

  return `你负责从长辈电话通话记录中提取结构化信息。

你只能基于老人原话提取，不得编造。

你需要识别：
1. **任务结果**（task_result）：是否完成、已收集的 slots
2. **风险信号**（risk_signals）：身体不适、情绪信号
3. **传话消息**（relay_message）：老人想带给子女的话
4. **记忆候选**（memory_candidates）：值得写入长期档案的信息
5. **关怀洞察**（care_insight）：事实摘要 + 关系洞察 + 建议行动 + 建议消息

## 安全策略
当前安全策略：${safety_policy.join(", ")}
${policy_constraints.length > 0 ? `约束：\n${policy_constraints.map((c) => `- ${c}`).join("\n")}` : ""}

## 通话记录（transcript）
${transcript}

## 通话状态
${JSON.stringify(call_state, null, 2)}

## 家庭上下文
${family_context}
${taskBlock}
## 规则
- 不得进行医疗诊断
- 如果老人提到不舒服，只记录症状，标记 should_notify_caregiver=true
- factual_summary 必须从 transcript 中找到具体依据
- relationship_insight 要有温度：捕捉长辈说漏嘴的关心、欲言又止的想念
- 感受判断必须用"我感觉/听起来/可能"表达，不要当成事实
- 不夸大，不煽情，不制造愧疚
- suggested_message 要像家人说话，20-60字，不责备不命令
- 记忆候选：只保存有价值信息，不要保存无意义寒暄

输出严格 JSON，不要 Markdown，不要解释。`;
}
