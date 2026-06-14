// =====================================================================
// v2 CallTurnEngine — 基于 turn-planner
// 去掉 memory_candidates，保留 observations
// =====================================================================
import { CallTurnSchema, CallTurnOutput } from "../schemas/call.schema";
import { buildCallTurnEnginePrompt } from "../prompts/call-turn-engine.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: CallTurnOutput = {
  analysis: {
    factual_info: {},
    task_slots: {},
    relationship_signals: [],
    emotion: { label: "neutral", evidence: "", confidence: 0.5 },
    probe_opportunities: [],
    stage_completed: false,
    should_end_call: false,
  },
  next: {
    action: "ask_health_question",
    stage: "open_care_question",
    reason: "兜底：继续关心长辈",
    assistant_text: "好的，我都记下来了。阿姨还有其他要跟我说的吗？",
    is_call_ending: false,
  },
  state_patch: {},
  observations: [],
  safety_level: "safe",
};

export async function planCallTurn(params: {
  elderUtterance: string;
  transcript: string;
  callState: Record<string, unknown>;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
}): Promise<CallTurnOutput> {
  const prompt = buildCallTurnEnginePrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    call_state: params.callState,
    transcript: params.transcript,
    elder_utterance: params.elderUtterance,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: CallTurnSchema,
    input: {
      elder_utterance: params.elderUtterance,
      transcript: params.transcript,
    },
    fallback: FALLBACK,
    agentName: "CallTurnEngine",
    temperature: 0.3,
    maxRetries: 1,
  });

  return data;
}
