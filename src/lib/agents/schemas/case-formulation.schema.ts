import { z } from "zod";

export const CaseFormulationSchema = z.object({
  new_known_facts: z.array(z.string()).default([]),
  updated_unknowns: z.array(z.string()).default([]),
  new_risk_flags: z
    .array(
      z.object({
        type: z.string(),
        content: z.string(),
        level: z.string().default("medium"),
      })
    )
    .default([]),
  updated_next_steps: z.array(z.string()).default([]),
  follow_up_at: z.string().optional(),
  status_change: z.enum(["open", "resolved", "escalated"]).optional(),
});
