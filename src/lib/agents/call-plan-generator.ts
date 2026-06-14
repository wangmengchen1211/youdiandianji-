/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/call-plan-builder.ts
 * 状态: deprecated → 待 Task 10 删除
 */
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

  // Care variation: rotate topics to avoid always asking about health
  const careRotation = [
    "您今天感觉怎么样？有没有哪里不舒服？",
    "这两天都忙些什么呢？有没有出去走走？",
    "最近胃口怎么样？有没有好好吃饭？",
    "今天心情怎么样？有没有什么开心的事？",
    "最近天气变化大，您要注意加减衣服呀。",
    "家里最近都挺好的吧？有没有什么需要帮忙的？",
  ];
  const careIndex = context.recentCallSummaries?.length ?? 0;
  const careScript = careRotation[careIndex % careRotation.length];

  // Relay rewriting: transform raw relay messages into warm versions
  let relayScript = "";
  if (context.pendingRelayMessages && context.pendingRelayMessages.length > 0) {
    const rawRelay = context.pendingRelayMessages[0]?.content ?? "";
    if (rawRelay.includes("忙") || rawRelay.includes("加班")) {
      relayScript = `${context.caregiverProfile.displayName}最近确实比较忙，可能没顾上打电话。但TA特意让我来问问您，不是不惦记。`;
    } else if (rawRelay.includes("想你") || rawRelay.includes("惦记")) {
      relayScript = `${context.caregiverProfile.displayName}让我转告您，TA一直惦记着您。`;
    } else {
      relayScript = `${context.caregiverProfile.displayName}特意让我转告您：${rawRelay}。`;
    }
  } else {
    relayScript = `${context.caregiverProfile.displayName}最近挺好的，让我来问候您一声。`;
  }

  const fallback: RawCallPlan = {
    call_plan_id: callPlanId,
    max_duration_seconds: 180,
    max_extra_questions: 2,
    stages: [
      { stage: "identity_and_consent", goal: "说明身份并自然开场", sample_script: `${context.elderProfile.displayName}呀，您好呀~我是${context.caregiverProfile.displayName}设置的小助理念念，TA今天惦记您啦，让我来跟您聊几句~` },
      { stage: "warm_greeting", goal: "温暖问候，先聊聊日常", sample_script: "您今天过得怎么样呀？" },
      { stage: "child_update", goal: "自然转达近况和传话", sample_script: relayScript },
      { stage: "open_care_question", goal: "关心长辈状态（变化话题）", sample_script: careScript },
      { stage: "task_reminder", goal: "核心提醒", sample_script: "对了对了，有个事想提醒您一下呀~" },
      { stage: "ask_relay_message", goal: "询问带话", sample_script: `您有没有什么话想让我带给${context.caregiverProfile.displayName}呀？` },
      { stage: "closing", goal: "温柔结束", sample_script: "好呀，我都记下来了~您注意休息呀，有什么事随时跟我说~" },
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
