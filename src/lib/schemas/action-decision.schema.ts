// =====================================================================
// v2.1 Action Decision Schema — LLM 提议 + 状态机校验
// Step 2: DecideNextAction
// =====================================================================
import { z } from "zod";

/**
 * LLM 提议的决策
 */
export const ActionProposalSchema = z.object({
  // LLM 提议的下一阶段
  proposed_stage: z.enum([
    "identity_and_consent",
    "warm_greeting",
    "child_update",
    "open_care_question",
    "listen_and_reflect",
    "task_reminder",
    "confirm_task",
    "ask_relay_message",
    "closing",
  ]),

  // LLM 提议的动作
  proposed_action: z.enum([
    "greet",
    "ask_health_question",
    "deliver_update",
    "remind_task",
    "confirm_task",
    "ask_relay",
    "listen_and_reflect",
    "close_call",
  ]),

  // 理由
  reason: z.string().default(""),

  // LLM 认为是否应该结束通话
  should_end_call: z.boolean().default(false),

  // 提取的实时观察（不写长期记忆）
  observations: z
    .array(
      z.object({
        type: z.enum([
          "health_fact",
          "routine_fact",
          "emotional_signal",
          "relationship_signal",
          "task_slot",
        ]),
        content: z.string(),
        confidence: z.number().min(0).max(1).default(0.8),
        source: z.string().default("elder_said"),
      })
    )
    .default([]),

  // state patch
  state_patch: z
    .object({
      task_slots: z.record(z.string(), z.unknown()).optional(),
      relationship_slots: z.record(z.string(), z.unknown()).optional(),
      probe_budget: z
        .object({
          totalRemaining: z.number().optional(),
          healthRemaining: z.number().optional(),
          relationshipRemaining: z.number().optional(),
        })
        .optional(),
      elder_willingness: z
        .enum(["unknown", "willing", "low", "refused"])
        .optional(),
      should_close_soon: z.boolean().optional(),
    })
    .default({}),

  // 安全等级
  safety_level: z.enum(["safe", "caution", "block"]).default("safe"),
});

export type ActionProposalOutput = z.infer<typeof ActionProposalSchema>;

/**
 * 状态机校验后的最终决策
 */
export const FinalDecisionSchema = z.object({
  final_stage: z.enum([
    "identity_and_consent",
    "warm_greeting",
    "child_update",
    "open_care_question",
    "listen_and_reflect",
    "task_reminder",
    "confirm_task",
    "ask_relay_message",
    "closing",
    "post_call_analysis",
  ]),

  final_action: z.enum([
    "greet",
    "ask_health_question",
    "deliver_update",
    "remind_task",
    "confirm_task",
    "ask_relay",
    "listen_and_reflect",
    "close_call",
  ]),

  validation: z.object({
    passed: z.boolean().default(true),
    hard_limit_hit: z.boolean().default(false),
    override_reason: z.string().default(""),
  }),

  should_end_call: z.boolean().default(false),

  observations: z
    .array(
      z.object({
        type: z.enum([
          "health_fact",
          "routine_fact",
          "emotional_signal",
          "relationship_signal",
          "task_slot",
        ]),
        content: z.string(),
        confidence: z.number().min(0).max(1).default(0.8),
        source: z.string().default("elder_said"),
      })
    )
    .default([]),

  state_patch: z
    .object({
      task_slots: z.record(z.string(), z.unknown()).optional(),
      relationship_slots: z.record(z.string(), z.unknown()).optional(),
      probe_budget: z
        .object({
          totalRemaining: z.number().optional(),
          healthRemaining: z.number().optional(),
          relationshipRemaining: z.number().optional(),
        })
        .optional(),
      elder_willingness: z
        .enum(["unknown", "willing", "low", "refused"])
        .optional(),
      should_close_soon: z.boolean().optional(),
    })
    .default({}),

  safety_level: z.enum(["safe", "caution", "block"]).default("safe"),
});

export type FinalDecisionOutput = z.infer<typeof FinalDecisionSchema>;
