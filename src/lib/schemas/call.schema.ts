// =====================================================================
// v2 Call Turn Engine Schema
// 基于 TurnPlannerSchema，去掉 memory_candidates，加 observations + safety_level
// =====================================================================
import { z } from "zod";

export const CallTurnSchema = z.object({
  analysis: z.object({
    factual_info: z.record(z.string(), z.unknown()).default({}),
    task_slots: z.record(z.string(), z.unknown()).default({}),
    relationship_signals: z
      .array(
        z.object({
          type: z.string(),
          content: z.string(),
          evidence: z.string(),
          confidence: z.number().min(0).max(1).default(0.7),
        })
      )
      .default([]),
    emotion: z
      .object({
        label: z.string().default("neutral"),
        evidence: z.string().default(""),
        confidence: z.number().min(0).max(1).default(0.7),
      })
      .default({ label: "neutral", evidence: "", confidence: 0.7 }),
    probe_opportunities: z
      .array(
        z.object({
          type: z.string(),
          question_goal: z.string(),
          priority: z.string().default("normal"),
        })
      )
      .default([]),
    stage_completed: z.boolean().default(false),
    should_end_call: z.boolean().default(false),
  }),
  next: z.object({
    action: z.string(),
    stage: z.string(),
    reason: z.string().default(""),
    assistant_text: z.string(),
    is_call_ending: z.boolean().default(false),
  }),
  state_patch: z
    .object({
      task_slots: z.record(z.string(), z.unknown()).optional(),
      relationship_slots: z.record(z.string(), z.unknown()).optional(),
      probe_budget: z
        .object({
          totalRemaining: z.number().optional(),
          healthRemaining: z.number().optional(),
          relationshipRemaining: z.number().optional(),
        })
        .optional(),
      elder_willingness: z
        .enum(["unknown", "willing", "low", "refused"])
        .optional(),
      should_close_soon: z.boolean().optional(),
    })
    .default({}),

  // --- v2: observations（实时观察，不写长期记忆）---
  observations: z
    .array(
      z.object({
        type: z.enum([
          "health_fact",
          "routine_fact",
          "emotional_signal",
          "relationship_signal",
          "task_slot",
        ]),
        content: z.string(),
        confidence: z.number().min(0).max(1).default(0.8),
        source: z.string().default("elder_said"),
      })
    )
    .default([]),

  // --- v2: safety_level ---
  safety_level: z.enum(["safe", "caution", "block"]).default("safe"),
});

export type CallTurnOutput = z.infer<typeof CallTurnSchema>;
