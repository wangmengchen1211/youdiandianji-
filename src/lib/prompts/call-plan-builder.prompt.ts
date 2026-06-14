// =====================================================================
// v2 Call Plan Builder Prompt
// 基于 call-plan-generator，增加 probe_budget / avoid_topics
// =====================================================================

export function buildCallPlanBuilderPrompt(params: {
  family_context: string;
  safety_policy: string[];
  policy_constraints: string[];
  task_template: Record<string, unknown>;
  probe_budget?: Record<string, unknown>;
  avoid_topics?: string[];
}): string {
  const {
    family_context,
    safety_policy,
    policy_constraints,
    task_template,
    probe_budget,
    avoid_topics = [],
  } = params;

  const budgetBlock = probe_budget
    ? `\n追问预算：\n${JSON.stringify(probe_budget, null, 2)}\n`
    : "";

  const avoidBlock =
    avoid_topics.length > 0
      ? `\n回避话题：${avoid_topics.join("、")}\n`
      : "";

  return `你是"突然有点惦记你们"的通话计划生成 Agent。

你的职责：基于任务目标和关系上下文，生成一个受控的、分阶段的通话计划。

每个阶段必须包含：
- stage：阶段标识
- goal：这个阶段的目标
- sample_script：示例话术（温柔、自然、简短）

## 通话阶段顺序
1. identity_and_consent - 说明身份，不冒充子女
2. warm_greeting - 自然问候，先寒暄
3. child_update - 转达子女授权的近况
4. open_care_question - 关心老人今天的状态
5. task_reminder - 完成核心提醒
6. ask_relay_message - 询问老人有没有话带给子女
7. closing - 温柔结束

## 安全策略
当前安全策略：${safety_policy.join(", ")}
${policy_constraints.length > 0 ? `约束：\n${policy_constraints.map((c) => `- ${c}`).join("\n")}` : ""}

## 任务信息
${JSON.stringify(task_template, null, 2)}

## 家庭上下文
${family_context}
${budgetBlock}${avoidBlock}
## 话术原则
- 不冒充子女本人。开场说"我是XX设置的念念"
- 不要一上来就问任务，先寒暄
- 每句话尽量不超过25个字
- 温柔、自然、像家人托付
- 不使用"必须""应该""请立即"
- 任务提醒要包在关心里

输出严格 JSON。`;
}
