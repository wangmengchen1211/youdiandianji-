import { z } from "zod";

export const CareInsightSchema = z.object({
  factual_summary: z.string(),
  relationship_insight: z.string(),
  suggested_action: z.string(),
  suggested_message: z.string(),
  confidence: z.number().min(0).max(1).default(0.85),
});
