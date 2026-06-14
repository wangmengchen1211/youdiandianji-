// =====================================================================
// v2 Deep Care Dialogue Engine Schema
// 合并 DepthPlanner + Probe + CaseFormulation
// 一次输出 reply + case_update + suggested_actions + hook_event
// =====================================================================
import { z } from "zod";

export const DeepCareDialogueSchema = z.object({
  // --- 回复文本 ---
  reply: z.string(),

  // --- 案例更新（CaseFormulation 合并）---
  case_update: z
    .object({
      should_create_case: z.boolean().default(false),
      case_type: z.string().optional(),
      new_known_facts: z.array(z.string()).default([]),
      updated_unknowns: z.array(z.string()).default([]),
      new_risk_flags: z
        .array(
          z.object({
            type: z.string(),
            content: z.string(),
            level: z.string().default("low"),
          })
        )
        .default([]),
      updated_next_steps: z.array(z.string()).default([]),
      follow_up_at: z.string().optional(),
      status_change: z.enum(["open", "resolved", "escalated"]).optional(),
    })
    .default({
      should_create_case: false,
      new_known_facts: [],
      updated_unknowns: [],
      new_risk_flags: [],
      updated_next_steps: [],
    }),

  // --- 建议动作 ---
  suggested_actions: z.array(z.string()).default([]),

  // --- Hook 事件（深度关怀后触发的主动消息）---
  hook_event: z
    .object({
      should_emit: z.boolean().default(false),
      event_type: z.string().optional(),
      payload: z.record(z.string(), z.unknown()).default({}),
    })
    .default({ should_emit: false, payload: {} }),

  // --- 追问维度（内部使用，不暴露给前端）---
  _probe_dimensions: z.array(z.string()).default([]).optional(),
});

export type DeepCareDialogueOutput = z.infer<typeof DeepCareDialogueSchema>;
