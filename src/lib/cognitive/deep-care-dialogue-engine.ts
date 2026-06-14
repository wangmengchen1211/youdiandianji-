// =====================================================================
// v2 DeepCareDialogueEngine
// 合并 depth-planner + probe-generator + case-formulation-builder
// 一次 LLM 输出 reply + case_update + suggested_actions + hook_event
// =====================================================================
import { DeepCareDialogueSchema, DeepCareDialogueOutput } from "../schemas/deep-care.schema";
import { buildDeepCareDialogueEnginePrompt } from "../prompts/deep-care-dialogue-engine.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: DeepCareDialogueOutput = {
  reply: "我帮你记下来了。你能再说说具体是什么情况吗？",
  case_update: {
    should_create_case: false,
    new_known_facts: [],
    updated_unknowns: [],
    new_risk_flags: [],
    updated_next_steps: [],
  },
  suggested_actions: [],
  hook_event: { should_emit: false, payload: {} },
};

export async function generateDeepCareDialogue(params: {
  userInput: string;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
  situationAnalysis: Record<string, unknown>;
  conversationHistory?: string[];
  existingCase?: Record<string, unknown> | null;
}): Promise<DeepCareDialogueOutput> {
  const prompt = buildDeepCareDialogueEnginePrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    user_input: params.userInput,
    situation_analysis: params.situationAnalysis,
    conversation_history: params.conversationHistory,
    existing_case: params.existingCase,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: DeepCareDialogueSchema,
    input: {
      user_input: params.userInput,
      situation_analysis: params.situationAnalysis,
    },
    fallback: FALLBACK,
    agentName: "DeepCareDialogueEngine",
    temperature: 0.3,
    maxRetries: 1,
  });

  return data;
}
