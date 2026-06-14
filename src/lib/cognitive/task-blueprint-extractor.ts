// =====================================================================
// v2 TaskBlueprintExtractor — 基于 task-designer
// =====================================================================
import { TaskBlueprintExtractorSchema, TaskBlueprintExtractorOutput } from "../schemas/task.schema";
import { buildTaskBlueprintExtractorPrompt } from "../prompts/task-blueprint-extractor.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: TaskBlueprintExtractorOutput = {
  intent: "create_daily_care_call",
  need_follow_up: true,
  missing_fields: ["elder", "time"],
  follow_up_question: "能告诉我你想提醒谁、什么时间吗？",
  task_blueprint: null,
};

export async function extractTaskBlueprint(params: {
  userInput: string;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
}): Promise<TaskBlueprintExtractorOutput> {
  const prompt = buildTaskBlueprintExtractorPrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    user_input: params.userInput,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: TaskBlueprintExtractorSchema,
    input: { user_input: params.userInput },
    fallback: FALLBACK,
    agentName: "TaskBlueprintExtractor",
    temperature: 0.2,
    maxRetries: 1,
  });

  return data;
}
