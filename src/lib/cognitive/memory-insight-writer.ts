// =====================================================================
// v2 MemoryInsightWriter — 合并 memory-curator + care-insight-writer
// 基于完整 transcript
// =====================================================================
import { MemoryInsightSchema, MemoryInsightOutput } from "../schemas/memory.schema";
import { buildMemoryInsightWriterPrompt } from "../prompts/memory-insight-writer.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: MemoryInsightOutput = {
  memory_candidates: [],
  care_insight: undefined,
  hook_events: [],
};

export async function writeMemoryAndInsight(params: {
  transcript: string;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
  taskResult?: Record<string, unknown> | null;
}): Promise<MemoryInsightOutput> {
  const prompt = buildMemoryInsightWriterPrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    transcript: params.transcript,
    task_result: params.taskResult,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: MemoryInsightSchema,
    input: { transcript: params.transcript },
    fallback: FALLBACK,
    agentName: "MemoryInsightWriter",
    temperature: 0.2,
    maxRetries: 1,
  });

  return data;
}
