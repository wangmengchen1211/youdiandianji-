import { z } from "zod";

export const DepthPlannerSchema = z.object({
  conversation_stage: z.string(),
  goal: z.string(),
  ask_dimensions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  response_style: z.string().default("warm_and_natural"),
  should_create_case: z.boolean().default(false),
  case_type: z.string().optional(),
});
