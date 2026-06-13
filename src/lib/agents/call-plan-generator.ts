import { llmStructuredCall } from "../llm/json-utils";
import { CallPlanSchema } from "./schemas/call-plan.schema";
import { CALL_PLAN_GENERATOR_PROMPT } from "./prompts/call-plan-generator.prompt";
import type { CallPlan, RelationshipContext } from "../store/types";
import type { z } from "zod";

type RawCallPlan = z.infer<typeof CallPlanSchema>;

function convertCallPlan(raw: RawCallPlan): CallPlan {
  return {
    callPlanId: raw.call_plan_id,
    maxDurationSeconds: raw.max_duration_seconds,
    maxExtraQuestions: raw.max_extra_questions,
    stages: raw.stages.map((s) => ({
      stage: s.stage as CallPlan["stages"][0]["stage"],
      goal: s.goal,
      sampleScript: s.sample_script,
    })),
  };
}

export async function generateCallPlan(
  context: RelationshipContext,
  callPlanId: string
): Promise<CallPlan> {
  const userPrompt = JSON.stringify({
    elder_profile: context.elderProfile,
    caregiver_profile: context.caregiverProfile,
    relationship_memory: context.relationshipMemory,
    recent_call_summaries: context.recentCallSummaries,
    pending_relay_messages: context.pendingRelayMessages,
    today_objectives: context.todayObjectives,
    call_plan_id: callPlanId,
  });

  const fallback: RawCallPlan = {
    call_plan_id: callPlanId,
    max_duration_seconds: 180,
    max_extra_questions: 2,
    stages: [
      { stage: "identity_and_consent", goal: "说明身份", sample_script: `${context.elderProfile.displayName}，您好呀。我是${context.caregiverProfile.displayName}设置的小助理。` },
      { stage: "warm_greeting", goal: "温暖问候", sample_script: "您今天过得怎么样？" },
      { stage: "child_update", goal: "转达近况", sample_script: `${context.caregiverProfile.displayName}最近有点忙，但一直惦记着您。` },
      { stage: "open_care_question", goal: "关心状态", sample_script: "您今天感觉怎么样？" },
      { stage: "task_reminder", goal: "核心提醒", sample_script: "对了，有个事想提醒您一下。" },
      { stage: "ask_relay_message", goal: "询问带话", sample_script: "您有没有什么话想让我带给${context.caregiverProfile.displayName}？" },
      { stage: "closing", goal: "温柔结束", sample_script: "好，我都记下来了。您注意休息。" },
    ],
  };

  try {
    const { data } = await llmStructuredCall(
      [
        { role: "system", content: CALL_PLAN_GENERATOR_PROMPT },
        { role: "user", content: userPrompt },
      ],
      CallPlanSchema,
      { fallback, maxRetries: 1 }
    );

    return convertCallPlan(data);
  } catch {
    return convertCallPlan(fallback);
  }
}
