// =====================================================================
// v2 IntentSituationClassifier — 合并 AgentRouter + SituationRecognizer
// 一次 LLM 调用输出 intent + situation + risk + routing + safety_policy
// 兜底：unknown + low risk + general_safe
// =====================================================================
import { IntentSituationSchema, IntentSituationOutput } from "../schemas/intent.schema";
import { buildIntentSituationClassifierPrompt } from "../prompts/intent-situation-classifier.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: IntentSituationOutput = {
  intent: "unknown",
  confidence: 0.3,
  reason: "分类失败，使用兜底",
  situation: {
    situation_type: "unknown",
    secondary_types: [],
    risk_level: "low",
    explicit_need: "",
    implicit_needs: [],
    missing_info: [],
    recommended_strategy: "ask_targeted_questions",
    forbidden_response: [],
  },
  safety_policy: ["general_safe"],
  routing: { target: "unknown", force_intent: false },
};

export async function classifyIntentAndSituation(params: {
  userInput: string;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
  conversationHistory?: string[];
}): Promise<IntentSituationOutput> {
  const prompt = buildIntentSituationClassifierPrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    user_input: params.userInput,
    conversation_history: params.conversationHistory,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: IntentSituationSchema,
    input: { user_input: params.userInput },
    fallback: FALLBACK,
    agentName: "IntentSituationClassifier",
    temperature: 0.2,
    maxRetries: 1,
  });

  return data;
}
