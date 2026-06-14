import { z } from "zod";

export const SituationRecognizerSchema = z.object({
  situation_type: z.enum([
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
  ]),
  secondary_types: z
    .array(
      z.enum([
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
      ])
    )
    .default([]),
  risk_level: z.enum(["low", "medium", "medium_high", "high"]),
  explicit_need: z.string(),
  implicit_needs: z.array(z.string()).default([]),
  missing_info: z.array(z.string()).default([]),
  recommended_strategy: z.enum([
    "ask_targeted_questions",
    "provide_safety_guidance",
    "create_task",
    "rewrite_message",
    "offer_emotional_support",
    "escalate_to_caregiver_action",
  ]),
  forbidden_response: z.array(z.string()).default([]),
});
