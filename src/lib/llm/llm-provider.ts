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
