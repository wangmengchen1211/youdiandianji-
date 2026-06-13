import { z, ZodTypeAny } from "zod";
import { callLLMJson, ChatMessage, LLMCallOptions } from "./llm-provider";

/**
 * Try to extract JSON from a string that may contain markdown fences or extra text
 */
function extractJson(raw: string): string {
  // Strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find first { ... } or [ ... ]
  const braceStart = raw.indexOf("{");
  const bracketStart = raw.indexOf("[");

  if (braceStart !== -1) {
    const braceEnd = raw.lastIndexOf("}");
    if (braceEnd > braceStart) return raw.slice(braceStart, braceEnd + 1);
  }

  if (bracketStart !== -1) {
    const bracketEnd = raw.lastIndexOf("]");
    if (bracketEnd > bracketStart)
      return raw.slice(bracketStart, bracketEnd + 1);
  }

  return raw.trim();
}

/**
 * Parse JSON string with error recovery
 */
function safeParse(raw: string): unknown | null {
  const cleaned = extractJson(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Repair common JSON issues and retry parse
 */
function repairJson(raw: string): unknown | null {
  let cleaned = extractJson(raw);

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

  // Replace single quotes with double quotes (simple cases)
  cleaned = cleaned.replace(/'([^']*)'/g, '"$1"');

  // Wrap unquoted keys
  cleaned = cleaned.replace(
    /(\{|,)\s*([a-zA-Z_]\w*)\s*:/g,
    '$1"$2":'
  );

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export type ParseResult<T> = {
  success: boolean;
  data: T | null;
  error?: string;
};

/**
 * Parse + Zod validate JSON string
 */
export function parseAndValidate<T extends ZodTypeAny>(
  raw: string,
  schema: T
): ParseResult<z.infer<T>> {
  // First try: direct parse
  const parsed = safeParse(raw);
  if (parsed !== null) {
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    // Zod failed but JSON parsed - return partial with error
    return {
      success: false,
      data: null,
      error: `Schema validation failed: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  // Second try: repair and parse
  const repaired = repairJson(raw);
  if (repaired !== null) {
    const result = schema.safeParse(repaired);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      data: null,
      error: `Schema validation failed after repair: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  return { success: false, data: null, error: "Failed to parse JSON" };
}

/**
 * Call LLM, parse response, validate with Zod schema.
 * On failure, optionally retry once with a repair hint.
 */
export async function llmStructuredCall<T extends ZodTypeAny>(
  messages: ChatMessage[],
  schema: T,
  options: {
    llmOptions?: Omit<LLMCallOptions, "jsonMode">;
    fallback?: z.infer<T>;
    maxRetries?: number;
  } = {}
): Promise<{ data: z.infer<T>; raw: string }> {
  const maxRetries = options.maxRetries ?? 1;

  let lastRaw = "";
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const augmentedMessages =
      attempt > 0
        ? [
            ...messages,
            {
              role: "user" as const,
              content: `Your previous JSON output had an error: ${lastError}. Please fix it and output valid JSON only.`,
            },
          ]
        : messages;

    lastRaw = await callLLMJson(augmentedMessages, options.llmOptions);
    const result = parseAndValidate(lastRaw, schema);

    if (result.success && result.data !== null) {
      return { data: result.data, raw: lastRaw };
    }

    lastError = result.error ?? "Unknown error";
  }

  // All retries exhausted
  if (options.fallback) {
    return { data: options.fallback, raw: lastRaw };
  }

  throw new Error(
    `LLM structured call failed after ${maxRetries + 1} attempts: ${lastError}`
  );
}
