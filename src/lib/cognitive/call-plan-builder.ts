// =====================================================================
// v2 CallPlanBuilder — 基于 call-plan-generator
// 增加 probe_budget / avoid_topics
// =====================================================================
import { buildCallPlanBuilderPrompt } from "../prompts/call-plan-builder.prompt";
import { generateStructuredOutput } from "../services/llm.service";
import { z } from "zod";

const CallPlanOutputSchema = z.object({
  stages: z.array(
    z.object({
      stage: z.string(),
      goal: z.string(),
      sample_script: z.string(),
    })
  ).default([]),
});

type CallPlanOutput = z.infer<typeof CallPlanOutputSchema>;

const FALLBACK: CallPlanOutput = {
  stages: [
    { stage: "identity_and_consent", goal: "说明身份", sample_script: "阿姨好，我是念念，是小雨设置的小助理。" },
    { stage: "warm_greeting", goal: "自然问候", sample_script: "今天身体怎么样呀？" },
    { stage: "closing", goal: "温柔结束", sample_script: "好的阿姨，那我就不打扰您了，注意休息~" },
  ],
};

export async function buildCallPlan(params: {
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
  taskTemplate: Record<string, unknown>;
  probeBudget?: Record<string, unknown>;
  avoidTopics?: string[];
}): Promise<CallPlanOutput> {
  const prompt = buildCallPlanBuilderPrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    task_template: params.taskTemplate,
    probe_budget: params.probeBudget,
    avoid_topics: params.avoidTopics,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: CallPlanOutputSchema,
    input: params.taskTemplate,
    fallback: FALLBACK,
    agentName: "CallPlanBuilder",
    temperature: 0.3,
    maxRetries: 1,
  });

  return data;
}
