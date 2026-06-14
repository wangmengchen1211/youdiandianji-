import { generateStructured } from "../llm/json-utils";
import type { ChatMessage } from "../llm/llm-provider";
import { ExtractResultSchema, type ExtractResult } from "./schemas/extract-result.schema";
import { EXTRACT_CANDIDATES_PROMPT } from "./prompts/extract-candidates.prompt";

export class LlmExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmExtractError";
  }
}

export type ExtractOptions = {
  elderName?: string;
  existingMemorySummary?: string;
  maxRetries?: number;
  timeoutMs?: number;
};

/**
 * Use LLM to extract structured memory candidates from raw text.
 * Falls back to empty result on failure (does NOT throw) so the caller
 * can still show rawText to the user.
 */
export async function extractCandidates(
  rawText: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const truncated = rawText.length > 6000 ? rawText.slice(0, 6000) + "\n[…省略…]" : rawText;
  const userPayload = JSON.stringify({
    elderName: options.elderName ?? null,
    rawText: truncated,
    existingMemorySummary: options.existingMemorySummary ?? null,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACT_CANDIDATES_PROMPT },
    { role: "user", content: userPayload },
  ];

  try {
    const { data } = await generateStructured(messages, ExtractResultSchema, {
      agentName: "import-memory-extract",
      maxRetries: options.maxRetries ?? 1,
      fallback: { candidates: [] },
    });
    // 二次过滤：confidence < 0.5 丢弃
    return {
      candidates: data.candidates.filter((c) => c.confidence >= 0.5),
    };
  } catch (err) {
    console.error("[extractCandidates] failed:", err);
    return { candidates: [] };
  }
}
