import { z } from "zod";

export const AgentRouterSchema = z.object({
  kind: z.enum([
    "createTask",
    "rewriteNote",
    "querySummary",
    "addElder",
    "deepCare",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1).default(0.8),
  reason: z.string(),
  situation_analysis: z
    .object({
      situation_type: z.string().optional(),
      risk_level: z.enum(["low", "medium", "medium_high", "high"]).optional(),
      explicit_need: z.string().optional(),
    })
    .optional(),
});
