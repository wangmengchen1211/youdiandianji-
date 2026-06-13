import { z } from "zod";

export const SlotExtractionSchema = z.object({
  task_status: z.enum(["completed", "partially_completed", "in_progress"]),
  slots: z.record(z.string(), z.unknown()),
  risk_signals: z.array(
    z.object({
      type: z.enum(["symptom", "emotional", "safety"]),
      content: z.string(),
      severity: z.enum(["low", "medium", "high", "unknown"]),
      should_notify_caregiver: z.boolean(),
    })
  ).default([]),
  message_to_child: z.string().nullable(),
  confidence: z.number().min(0).max(1).default(0.8),
  needs_review: z.boolean().default(false),
});
