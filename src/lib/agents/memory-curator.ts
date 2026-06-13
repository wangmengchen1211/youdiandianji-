import { llmStructuredCall } from "../llm/json-utils";
import { MemoryExtractionSchema } from "./schemas/memory-curator.schema";
import { MEMORY_CURATOR_PROMPT } from "./prompts/memory-curator.prompt";
import type { MemoryExtractionOutput, TranscriptEntry } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof MemoryExtractionSchema>;

function convert(raw: RawOutput): MemoryExtractionOutput {
  return {
    newMemories: raw.new_memories.map((m) => ({
      type: m.type,
      content: m.content,
      importance: m.importance,
      confidence: m.confidence,
      writeTo: m.write_to,
      requiresReview: m.requires_review,
    })),
  };
}

export async function extractMemories(
  transcript: TranscriptEntry[],
  existingMemories: string[]
): Promise<MemoryExtractionOutput> {
  const userPrompt = JSON.stringify({
    call_transcript: transcript.map((t) => ({
      speaker: t.speaker,
      text: t.text,
    })),
    existing_memories: existingMemories,
  });

  const fallback: RawOutput = { new_memories: [] };

  try {
    const { data } = await llmStructuredCall(
      [
        { role: "system", content: MEMORY_CURATOR_PROMPT },
        { role: "user", content: userPrompt },
      ],
      MemoryExtractionSchema,
      { fallback, maxRetries: 1 }
    );
    return convert(data);
  } catch {
    return convert(fallback);
  }
}
