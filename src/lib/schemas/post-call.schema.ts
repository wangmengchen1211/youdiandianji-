// =====================================================================
// v2 Post-call Extractor Schema
// 基于 ResponseUnderstandingSchema + CareInsightSchema
// 通话后权威提取：task_result + risk_signals + relay_message
// =====================================================================
import { z } from "zod";

export const PostCallSchema = z.object({
  // --- 任务结果 ---
  task_result: z
    .object({
      status: z.enum([
        "completed",
        "partially_completed",
        "in_progress",
        "no_answer",
      ]),
      slots: z.record(z.string(), z.unknown()).default({}),
      confidence: z.number().min(0).max(1).default(0.8),
      needs_review: z.boolean().default(false),
    })
    .default({
      status: "partially_completed",
      slots: {},
      confidence: 0.8,
      needs_review: false,
    }),

  // --- 风险信号 ---
  risk_signals: z
    .array(
      z.object({
        type: z.enum(["symptom", "emotional", "safety"]),
        content: z.string(),
        severity: z.enum(["low", "medium", "high", "unknown"]).default("low"),
        should_notify_caregiver: z.boolean().default(false),
      })
    )
    .default([]),

  // --- 传话消息 ---
  relay_message: z.string().nullable(),

  // --- 记忆候选（通话后写入长期记忆）---
  memory_candidates: z
    .array(
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
    )
    .default([]),

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

export type PostCallOutput = z.infer<typeof PostCallSchema>;
