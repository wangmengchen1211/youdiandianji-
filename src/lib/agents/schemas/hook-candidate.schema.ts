import { z } from "zod";

export const HookCandidateSchema = z.object({
  hook_type: z.string(),
  trigger_reason: z.string(),
  message_goal: z.string(),
  case_id: z.string().optional(),
  scheduled_minutes_from_now: z.number().min(0).default(0),
  score: z
    .object({
      importance: z.number().min(0).max(1).default(0.5),
      timeliness: z.number().min(0).max(1).default(0.5),
      relationship_value: z.number().min(0).max(1).default(0.5),
      risk_level: z.number().min(0).max(1).default(0.3),
      user_burden: z.number().min(0).max(1).default(0.3),
      repetition_penalty: z.number().min(0).max(1).default(0.1),
      intrusion_risk: z.number().min(0).max(1).default(0.2),
      final_score: z.number().min(0).max(1).default(0.5),
    })
    .default({
      importance: 0.5,
      timeliness: 0.5,
      relationship_value: 0.5,
      risk_level: 0.3,
      user_burden: 0.3,
      repetition_penalty: 0.1,
      intrusion_risk: 0.2,
      final_score: 0.5,
    }),
});
