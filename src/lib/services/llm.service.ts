// =====================================================================
// v2 LLM Service — 统一 LLM 调用入口
// 封装 generateStructured，增加 Service 层语义
// 所有 Cognitive Skills 不直接调用 DeepSeek，必须调用此 Service
// =====================================================================
import { z, ZodTypeAny } from "zod";
import { generateStructured as jsonUtilsGenerate } from "../llm/json-utils";
import type { ChatMessage } from "../llm/llm-provider";

export type LLMServiceOptions = {
  agentName: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
};

/**
 * 统一结构化 LLM 调用。
 * 所有 v2 Cognitive Skills 必须通过此函数调用 LLM。
 *
 * 职责：
 * 1. 封装 DeepSeek 调用
 * 2. 支持 Zod 结构化输出 + JSON parse 失败后的 repair
 * 3. 支持最多 1-2 次重试
 * 4. 支持 fallback 输出
 * 5. 记录 prompt / schema / raw output / parse error
 */
export async function generateStructuredOutput<T extends ZodTypeAny>(params: {
  prompt: string;
  schema: T;
  input: unknown;
  fallback: z.infer<T>;
  agentName: string;
  temperature?: number;
  maxRetries?: number;
}): Promise<{ data: z.infer<T>; raw: string }> {
  const {
    prompt,
    schema,
    input,
    fallback,
    agentName,
    temperature = 0.2,
    maxRetries = 1,
  } = params;

  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: typeof input === "string" ? input : JSON.stringify(input, null, 2) },
  ];

  try {
    return await jsonUtilsGenerate(messages, schema, {
      agentName,
      llmOptions: { temperature },
      fallback,
      maxRetries,
    });
  } catch (error) {
    console.error(`[LLM Service] ${agentName} failed:`, error);
    return { data: fallback, raw: "" };
  }
}

/**
 * 简化版：只传 prompt string，返回 string（非结构化）。
 */
export async function generateTextOutput(params: {
  prompt: string;
  userMessage: string;
  agentName: string;
  temperature?: number;
  fallback?: string;
}): Promise<string> {
  const { prompt, userMessage, agentName, temperature = 0.3, fallback = "" } = params;

  const messages: ChatMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: userMessage },
  ];

  try {
    const { callLLMTraced } = await import("../llm/llm-provider");
    return await callLLMTraced(messages, {
      agentName,
      temperature,
    });
  } catch (error) {
    console.error(`[LLM Service] ${agentName} text generation failed:`, error);
    return fallback;
  }
}
