// =====================================================================
// v2 Hook Message Planner Schema
// HookMessagePlanner 输出（LLM 不负责 should_send）
// 包含 trigger_event / why_now / message_goal 确保上下文可追溯
// =====================================================================
import { z } from "zod";

export const HookMessagePlannerSchema = z.object({
  message: z.string(),
  reason: z.string(),
  delivery_hint: z.enum(["push", "in_app", "none"]).default("in_app"),

  // --- 触发上下文（v2 新增）---
  trigger_event: z.string().default(""),
  why_now: z.string().default(""),
  message_goal: z.string().default(""),

  // --- 冷却建议 ---
  cooldown_hours: z.number().min(0).optional(),

  // --- 风险提示 ---
  risk_notes: z.array(z.string()).default([]),
});

export type HookMessagePlannerOutput = z.infer<
  typeof HookMessagePlannerSchema
>;
