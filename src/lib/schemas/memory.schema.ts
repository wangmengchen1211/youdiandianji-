// =====================================================================
// v2 Memory Insight Writer Schema
// 合并 MemoryExtraction + CareInsight
// 输出 memory_candidates + care_insight + hook_events
// =====================================================================
import { z } from "zod";

export const MemoryInsightSchema = z.object({
  // --- 记忆候选 ---
  memory_candidates: z.array(
    z.object({
      type: z.enum([
        "health_memory",
        "routine_memory",
        "preference_memory",
        "relationship_memory",
        "relay_memory",
        "emotional_signal",
      ]),
      content: z.string(),
      importance: z.enum(["low", "medium", "high"]).default("medium"),
      confidence: z.number().min(0).max(1).default(0.8),
      requires_review: z.boolean().default(false),
    })
  ).default([]),

  // --- 关怀洞察 ---
  care_insight: z
    .object({
      factual_summary: z.string(),
      relationship_insight: z.string(),
      suggested_action: z.string(),
      suggested_message: z.string(),
      confidence: z.number().min(0).max(1).default(0.85),
    })
    .optional(),

  // --- Hook 事件 ---
  hook_events: z
    .array(
      z.object({
        event_type: z.string(),
        payload: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .default([]),
});

export type MemoryInsightOutput = z.infer<typeof MemoryInsightSchema>;
