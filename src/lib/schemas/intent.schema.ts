// =====================================================================
// v2 Intent + Situation Classifier Schema
// 合并 AgentRouter + SituationRecognizer，一次 LLM 输出
// intent + situation + risk + routing + safety_policy
// =====================================================================
import { z } from "zod";

const SituationTypeEnum = z.enum([
  "possible_cognitive_decline",
  "elder_health_change",
  "elder_emotional_distress",
  "caregiver_burnout",
  "parent_child_conflict",
  "guilt_and_distance",
  "missed_medication",
  "safety_risk",
  "loneliness_signal",
  "routine_care_task",
  "relationship_repair",
  "festival_or_anniversary_care",
  "unknown",
]);

const SafetyPolicyEnum = z.enum([
  "general_safe",
  "medical_no_diagnosis",
  "medical_no_dosage",
  "cognitive_careful",
  "no_impersonation",
  "no_blame_no_guilt",
  "no_sensitive_extraction",
]);

export const IntentSituationSchema = z.object({
  // --- Intent routing ---
  intent: z.enum([
    "deep_care",
    "create_task",
    "rewrite_note",
    "query_summary",
    "add_elder",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1).default(0.8),
  reason: z.string(),

  // --- Situation analysis ---
  situation: z.object({
    situation_type: SituationTypeEnum,
    secondary_types: z.array(SituationTypeEnum).default([]),
    risk_level: z.enum(["low", "medium", "medium_high", "high"]).default("low"),
    explicit_need: z.string().default(""),
    implicit_needs: z.array(z.string()).default([]),
    missing_info: z.array(z.string()).default([]),
    recommended_strategy: z
      .enum([
        "ask_targeted_questions",
        "provide_safety_guidance",
        "create_task",
        "rewrite_message",
        "offer_emotional_support",
        "escalate_to_caregiver_action",
      ])
      .default("ask_targeted_questions"),
    forbidden_response: z.array(z.string()).default([]),
  }),

  // --- Safety policy from LLM ---
  safety_policy: z.array(SafetyPolicyEnum).default(["general_safe"]),

  // --- Routing hint ---
  routing: z.object({
    target: z.string().default("unknown"),
    force_intent: z.boolean().default(false),
  }).default({ target: "unknown", force_intent: false }),
});

export type IntentSituationOutput = z.infer<typeof IntentSituationSchema>;
