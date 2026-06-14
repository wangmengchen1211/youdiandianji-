// =====================================================================
// v2 IntentSituationClassifier Prompt
// 合并 agent-router + situation-recognizer
// 支持注入 safety_policy / policy_constraints / family_context
// =====================================================================

export function buildIntentSituationClassifierPrompt(params: {
  family_context: string;
  safety_policy: string[];
  policy_constraints: string[];
  user_input: string;
  conversation_history?: string[];
}): string {
  const {
    family_context,
    safety_policy,
    policy_constraints,
    user_input,
    conversation_history = [],
  } = params;

  const historyBlock =
    conversation_history.length > 0
      ? `\n最近对话：\n${conversation_history.join("\n")}\n`
      : "";

  return `你是"突然有点惦记你们"的统一分类 Agent（念念）。

你的职责：在一次输出中同时完成两件事：
1. 判断用户输入的意图类型（路由）
2. 识别当前情境类型和风险等级

## 意图类型（intent）
- deep_care：深度关怀对话（如"妈妈最近老忘事我很担心"、"爸爸好像心情不好"、"我妈血糖一直控制不住"）
- create_task：创建提醒任务（如"帮我提醒妈妈吃药"、"每天8点给爸爸打电话"）
- rewrite_note：改写小纸条（如"帮我给妈妈写段话"、"我想跟她说..."）
- query_summary：查询状态摘要（如"最近妈妈怎么样"、"上次通话说了什么"）
- add_elder：添加长辈（如"帮我加一下我姥姥"、"新增一个联系人"）
- unknown：无法判断，需要追问

## 情境类型（situation.situation_type）
- possible_cognitive_decline / elder_health_change / elder_emotional_distress
- caregiver_burnout / parent_child_conflict / guilt_and_distance
- missed_medication / safety_risk / loneliness_signal
- routine_care_task / relationship_repair / festival_or_anniversary_care / unknown

## 风险等级（situation.risk_level）
- low / medium / medium_high / high

## 安全策略（safety_policy）
当前安全策略：${safety_policy.join(", ")}
${policy_constraints.length > 0 ? `约束：\n${policy_constraints.map((c) => `- ${c}`).join("\n")}` : ""}

## 家庭上下文
${family_context}
${historyBlock}
## 用户输入
${user_input}

## 规则
- 绝不提供医疗诊断。如果用户描述症状，标记 risk_level >= medium_high。
- 风险判断要保守：有安全顾虑时宁可高估。
- forbidden_response 必须具体（如"不能说'你妈妈就是老年痴呆'"）。
- 如果输入是简单任务请求 → routine_care_task + low。
- 如果 recent_call_summaries 显示长辈刚表达过某种担忧，用户后续追问要顺承这个语境。
- safety_policy 必须包含与 situation_type 对应的策略（如 cognitive → cognitive_careful, 医疗 → medical_no_diagnosis）。

输出严格 JSON，不要 Markdown，不要解释。`;
}
