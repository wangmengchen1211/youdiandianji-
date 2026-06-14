// =====================================================================
// v2 Task Blueprint Extractor Schema
// 基于 TaskBlueprintSchema，保持不变
// =====================================================================
import { z } from "zod";

export const TaskBlueprintExtractorSchema = z.object({
  intent: z.literal("create_daily_care_call"),
  need_follow_up: z.boolean(),
  missing_fields: z.array(z.string()).default([]),
  follow_up_question: z.string().nullable(),
  task_blueprint: z
    .object({
      elder_id: z.string(),
      elder_display_name: z.string(),
      title: z.string(),
      task_type: z.literal("daily_care_call"),
      recurrence_rule: z.object({
        type: z.enum(["daily", "weekly", "once"]),
        time: z.string(),
        timezone: z.string().default("Asia/Shanghai"),
        days_of_week: z.array(z.number()).optional(),
      }),
      primary_objectives: z.array(
        z.object({
          type: z.enum([
            "reminder",
            "health_check",
            "bring_items",
            "call_back",
            "other",
          ]),
          content: z.string(),
        })
      ),
      relationship_objectives: z
        .array(
          z.object({
            type: z.string(),
            content: z.string(),
          })
        )
        .default([]),
      required_slots: z.array(z.string()).default([]),
      retry_policy: z
        .object({
          max_attempts: z.number().default(2),
          retry_after_minutes: z.number().default(10),
        })
        .default({ max_attempts: 2, retry_after_minutes: 10 }),
      call_policy: z
        .object({
          max_duration_seconds: z.number().default(180),
          max_extra_questions: z.number().default(2),
          tone: z.string().default("warm_family_like"),
        })
        .default({
          max_duration_seconds: 180,
          max_extra_questions: 2,
          tone: "warm_family_like",
        }),
    })
    .nullable(),
});

export type TaskBlueprintExtractorOutput = z.infer<
  typeof TaskBlueprintExtractorSchema
>;
