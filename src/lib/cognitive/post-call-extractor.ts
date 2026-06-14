// =====================================================================
// v2 PostCallExtractor — 基于 response-understanding
// 通话后权威提取器
// =====================================================================
import { PostCallSchema, PostCallOutput } from "../schemas/post-call.schema";
import { buildPostCallExtractorPrompt } from "../prompts/post-call-extractor.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: PostCallOutput = {
  task_result: {
    status: "partially_completed",
    slots: {},
    confidence: 0.5,
    needs_review: true,
  },
  risk_signals: [],
  relay_message: null,
  memory_candidates: [],
  care_insight: undefined,
  hook_events: [],
};

export async function extractPostCall(params: {
  transcript: string;
  callState: Record<string, unknown>;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
  taskTemplate?: Record<string, unknown> | null;
}): Promise<PostCallOutput> {
  const prompt = buildPostCallExtractorPrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    transcript: params.transcript,
    call_state: params.callState,
    task_template: params.taskTemplate,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: PostCallSchema,
    input: { transcript: params.transcript },
    fallback: FALLBACK,
    agentName: "PostCallExtractor",
    temperature: 0.2,
    maxRetries: 1,
  });

  return data;
}
