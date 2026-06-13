import { llmStructuredCall } from "../llm/json-utils";
import { CareInsightSchema } from "./schemas/care-insight.schema";
import { CARE_INSIGHT_WRITER_PROMPT } from "./prompts/care-insight-writer.prompt";
import type { CareInsightOutput, TaskResult } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof CareInsightSchema>;

export type CareInsightInput = {
  taskResult: TaskResult;
  elderMessage: string | null;
  childUpdateDelivered: string;
  relationshipMemory: string[];
  elderDisplayName: string;
  caregiverDisplayName: string;
};

export async function generateCareInsight(
  input: CareInsightInput
): Promise<CareInsightOutput> {
  const userPrompt = JSON.stringify({
    task_result: input.taskResult.slots,
    elder_message: input.elderMessage,
    child_update_delivered: input.childUpdateDelivered,
    relationship_memory: input.relationshipMemory,
    elder_display_name: input.elderDisplayName,
    caregiver_display_name: input.caregiverDisplayName,
  });

  const fallback: RawOutput = {
    factual_summary: `${input.elderDisplayName}今天的任务已完成。`,
    relationship_insight: "通话顺利，长辈状态正常。",
    suggested_action: "如果有时间，可以给长辈回个电话。",
    suggested_message: `${input.elderDisplayName}，今天聊得开心，注意休息。`,
    confidence: 0.6,
  };

  try {
    const { data } = await llmStructuredCall(
      [
        { role: "system", content: CARE_INSIGHT_WRITER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      CareInsightSchema,
      { fallback, maxRetries: 1 }
    );

    return {
      factualSummary: data.factual_summary,
      relationshipInsight: data.relationship_insight,
      suggestedAction: data.suggested_action,
      suggestedMessage: data.suggested_message,
      confidence: data.confidence,
    };
  } catch {
    return {
      factualSummary: fallback.factual_summary,
      relationshipInsight: fallback.relationship_insight,
      suggestedAction: fallback.suggested_action,
      suggestedMessage: fallback.suggested_message,
      confidence: fallback.confidence,
    };
  }
}
