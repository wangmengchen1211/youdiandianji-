import { z } from "zod";

export const CallPlanSchema = z.object({
  call_plan_id: z.string(),
  max_duration_seconds: z.number(),
  max_extra_questions: z.number(),
  stages: z.array(
    z.object({
      stage: z.string(),
      goal: z.string(),
      sample_script: z.string(),
    })
  ),
});
