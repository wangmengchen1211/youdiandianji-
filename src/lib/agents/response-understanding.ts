/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/post-call-extractor.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { llmStructuredCall } from "../llm/json-utils";
import { SlotExtractionSchema } from "./schemas/response-understanding.schema";
import { RESPONSE_UNDERSTANDING_PROMPT } from "./prompts/response-understanding.prompt";
import type { ResponseUnderstandingOutput, TranscriptEntry } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof SlotExtractionSchema>;

function convert(raw: RawOutput): ResponseUnderstandingOutput {
  return {
    taskStatus: raw.task_status,
    slots: raw.slots,
    riskSignals: raw.risk_signals.map((s) => ({
      type: s.type,
      content: s.content,
      severity: s.severity,
      shouldNotifyCaregiver: s.should_notify_caregiver,
    })),
    messageToChild: raw.message_to_child,
    confidence: raw.confidence,
    needsReview: raw.needs_review,
  };
}

/**
 * @deprecated Use TurnPlanner for real-time turn analysis during calls.
 * This function is now only used as a Post-call Extractor in finalizeCall().
 * It extracts task results, relay messages, risk signals, and memory candidates
 * from the complete call transcript.
 */
export async function extractResponseUnderstanding(
  elderReply: string,
  requiredSlots: string[]
): Promise<ResponseUnderstandingOutput> {
  const userPrompt = JSON.stringify({
    elder_reply: elderReply,
    required_slots: requiredSlots,
  });

  const fallback: RawOutput = {
    task_status: "in_progress",
    slots: {},
    risk_signals: [],
    message_to_child: null,
    confidence: 0.5,
    needs_review: true,
  };

  try {
    const { data } = await llmStructuredCall(
      [
        { role: "system", content: RESPONSE_UNDERSTANDING_PROMPT },
        { role: "user", content: userPrompt },
      ],
      SlotExtractionSchema,
      { fallback, maxRetries: 1 }
    );
    return convert(data);
  } catch {
    return convert(fallback);
  }
}

/**
 * Post-call Extractor: Extract structured results from complete call transcript.
 * Called in finalizeCall() after the call ends.
 * Extracts: task completion status, relay messages, risk signals, memory candidates.
 */
export async function extractPostCallSummary(
  transcript: TranscriptEntry[],
  requiredSlots: string[]
): Promise<ResponseUnderstandingOutput> {
  const fullTranscript = transcript
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");

  return extractResponseUnderstanding(fullTranscript, requiredSlots);
}
