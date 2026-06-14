const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMCallOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured.");
  return key;
}

export async function callLLM(
  messages: ChatMessage[],
  options: LLMCallOptions = {}
): Promise<string> {
  const apiKey = getApiKey();
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

  const body: Record<string, unknown> = {
    model,
    temperature: options.temperature ?? 0.3,
    messages,
  };

  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status >= 500 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`DeepSeek API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("DeepSeek returned empty content.");
      }

      return content;
    } catch (error) {
      if (attempt === 2) throw error;
      if (
        error instanceof Error &&
        error.message.startsWith("DeepSeek API error 5")
      ) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("LLM call failed after 3 attempts.");
}

/**
 * Convenience: call LLM with JSON mode and get raw string back
 */
export async function callLLMJson(
  messages: ChatMessage[],
  options: Omit<LLMCallOptions, "jsonMode"> = {}
): Promise<string> {
  return callLLM(messages, { ...options, jsonMode: true });
}

// =====================================================================
// Traced LLM call - records every call for observability
// =====================================================================
import { traceStore } from "./trace-store";

function estimateTokens(text: string): number {
  // Rough estimate: ~1.5 tokens per Chinese character, ~0.75 per English word
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const english = text.length - chinese;
  return Math.ceil(chinese * 1.5 + english * 0.3);
}

export type TracedCallOptions = LLMCallOptions & {
  agentName: string;
};

/**
 * Call LLM with automatic trace recording.
 * All new Agent modules should use this instead of raw callLLM.
 */
export async function callLLMTraced(
  messages: ChatMessage[],
  options: TracedCallOptions
): Promise<string> {
  const { agentName, ...llmOptions } = options;
  const start = Date.now();
  const inputSummary = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 120)}...`)
    .join("\n")
    .slice(0, 500);

  try {
    const content = await callLLM(messages, llmOptions);
    const latencyMs = Date.now() - start;
    traceStore.record({
      agentName,
      inputSummary,
      outputSummary: content.slice(0, 500),
      schemaValid: true,
      latencyMs,
      usedFallback: false,
      tokenEstimate: {
        prompt: estimateTokens(inputSummary),
        completion: estimateTokens(content),
      },
      timestamp: new Date().toISOString(),
    });
    return content;
  } catch (error) {
    const latencyMs = Date.now() - start;
    traceStore.record({
      agentName,
      inputSummary,
      outputSummary: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      schemaValid: false,
      schemaError: error instanceof Error ? error.message : String(error),
      latencyMs,
      usedFallback: false,
      tokenEstimate: { prompt: estimateTokens(inputSummary), completion: 0 },
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

/**
 * Convenience: call LLM in JSON mode with trace recording.
 */
export async function callLLMJsonTraced(
  messages: ChatMessage[],
  options: TracedCallOptions
): Promise<string> {
  return callLLMTraced(messages, { ...options, jsonMode: true });
}
