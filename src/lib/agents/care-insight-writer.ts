/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/memory-insight-writer.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { llmStructuredCall } from "../llm/json-utils";
import { CareInsightSchema } from "./schemas/care-insight.schema";
import { CARE_INSIGHT_WRITER_PROMPT } from "./prompts/care-insight-writer.prompt";
import type { CareInsightOutput, TaskResult, TranscriptEntry } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof CareInsightSchema>;

export type CareInsightInput = {
  taskResult: TaskResult;
  elderMessage: string | null;
  childUpdateDelivered: string;
  relationshipMemory: string[];
  elderDisplayName: string;
  caregiverDisplayName: string;
  transcript: TranscriptEntry[];  // P0-2: 补上完整对话记录
};

export async function generateCareInsight(
  input: CareInsightInput
): Promise<CareInsightOutput> {
  // 把 transcript 压缩成人类可读的多行文本（限制长度避免 prompt 过大）
  const transcriptText = input.transcript
    .map((t) => `${t.speaker === "assistant" ? "念念" : input.elderDisplayName}：${t.text}`)
    .join("\n")
    .slice(-2400);  // 末尾 2400 字符（约 8-10 轮）

  const userPrompt = JSON.stringify({
    task_result: input.taskResult.slots,
    task_status: input.taskResult.status,
    elder_message: input.elderMessage,
    child_update_delivered: input.childUpdateDelivered,
    relationship_memory: input.relationshipMemory,
    elder_display_name: input.elderDisplayName,
    caregiver_display_name: input.caregiverDisplayName,
    transcript: transcriptText,  // 通话完整记录
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
