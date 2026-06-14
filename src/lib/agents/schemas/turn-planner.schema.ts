import { z } from "zod";

export const TurnPlannerSchema = z.object({
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
  memory_candidates: z
    .array(
      z.object({
        type: z.string(),
        content: z.string(),
        confidence: z.number().min(0).max(1).default(0.8),
        requires_review: z.boolean().default(false),
      })
    )
    .default([]),
});
