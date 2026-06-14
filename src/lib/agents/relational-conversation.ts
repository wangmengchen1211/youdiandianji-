/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/workflows/call.workflow.ts + src/lib/cognitive/call-turn-engine.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { llmStructuredCall } from "../llm/json-utils";
import { ConversationReplySchema } from "./schemas/conversation.schema";
import { RELATIONAL_CONVERSATION_PROMPT } from "./prompts/relational-conversation.prompt";
import type { CallPlan, CallStage, ConversationState, RelationshipContext, TranscriptEntry } from "../store/types";
import type { z } from "zod";

type RawReply = z.infer<typeof ConversationReplySchema>;

export type ConversationTurnInput = {
  context: RelationshipContext;
  callPlan: CallPlan;
  currentStage: CallStage;
  transcript: TranscriptEntry[];
  conversationState: ConversationState;
};

export type ConversationTurnOutput = {
  assistantReply: string;
  tone: string;
  safetyFlags: string[];
};

export async function generateConversationReply(
  input: ConversationTurnInput
): Promise<ConversationTurnOutput> {
  const currentStagePlan = input.callPlan.stages.find(
    (s) => s.stage === input.currentStage
  );

  const userPrompt = JSON.stringify({
    elder_profile: input.context.elderProfile,
    caregiver_profile: input.context.caregiverProfile,
    relationship_memory: input.context.relationshipMemory,
    pending_relay_messages: input.context.pendingRelayMessages,
    current_stage: input.currentStage,
    current_stage_goal: currentStagePlan?.goal ?? "",
    current_stage_sample: currentStagePlan?.sampleScript ?? "",
    transcript: input.transcript.slice(-8).map((t) => ({
      speaker: t.speaker,
      text: t.text,
    })),
    task_slots_collected: input.conversationState.taskSlots,
    turn_count: input.conversationState.turnCount,
  });

  // P2-7: 智能兜底——根据 stage + elder 上句 + 槽位生成不模板化的回复
  const lastElderUtterance = [...input.transcript]
    .reverse()
    .find((t) => t.speaker === "elder")?.text ?? "";
  const slots = Object.keys(input.conversationState.taskSlots);
  const elderName = input.context.elderProfile?.displayName ?? "";
  const caregiverName = input.context.caregiverProfile?.displayName ?? "家人";
  const eText = lastElderUtterance;
  const eHas = (kw: string) => eText.includes(kw);
  const stageFallback: Record<string, (elderLast: string, slotsCount: number) => string> = {
    identity_and_consent: () =>
      "阿姨/叔叔您好，我是念念，是家人设置的小助理念念，今天来跟您聊几句，方便吗？",
    warm_greeting: (e) =>
      e ? `嗯嗯，您最近身体都好吧？` : "您最近身体都好吧？",
    child_update: () => "家人让我跟您说，最近一切都好，让您放心~",
    open_care_question: (e) => {
      if (!e) return "您最近身体怎么样呀？有没有哪里不太舒服的？";
      const ack = eHas("好") || eHas("行") ? "听您这么说我就放心啦~" : "我记下来啦~";
      return `${ack} 您还吃得好睡得好吧？`;
    },
    listen_and_reflect: (e) =>
      e ? "嗯，我听着呢。您慢慢说，我在听。" : "嗯嗯，我在听，您说。",
    task_reminder: (e) =>
      e
        ? (eHas("没") || eHas("忘") ? "没事没事，下次记得就好。我帮您记下来啦~" : "好的好的~")
        : "对了，您今天的情况怎么样？我帮您记一下~",
    confirm_task: (e) =>
      e
        ? (eHas("没") || eHas("不")
            ? `嗯嗯没关系，下次再说。${elderName}您今天辛苦了。`
            : "好的，记下来啦~")
        : "好的，记下来啦~",
    ask_relay_message: () =>
      `对了，${caregiverName}那边有没有什么想跟您说的？要不要我帮您转告？`,
    closing: (e) =>
      e && e.length > 10
        ? `嗯嗯，今天聊得挺好。${elderName}您注意身体，${caregiverName}惦记您~我下次再来看您。`
        : `好嘞，今天先到这儿。您注意身体，${caregiverName}惦记您~`,
    post_call_analysis: () => "好的，我先整理一下今天的聊天内容。",
  };
  const fallbackReply =
    stageFallback[input.currentStage]?.(lastElderUtterance, slots.length) ??
    currentStagePlan?.sampleScript ??
    "嗯嗯，我在听~";

  const fallback: RawReply = {
    assistant_reply: fallbackReply,
    tone: "warm",
    safety_flags: [],
  };

  try {
    const { data } = await llmStructuredCall(
      [
        { role: "system", content: RELATIONAL_CONVERSATION_PROMPT },
        { role: "user", content: userPrompt },
      ],
      ConversationReplySchema,
      { fallback, maxRetries: 1 }
    );

    return {
      assistantReply: data.assistant_reply,
      tone: data.tone,
      safetyFlags: data.safety_flags,
    };
  } catch {
    return {
      assistantReply: fallback.assistant_reply,
      tone: fallback.tone,
      safetyFlags: fallback.safety_flags,
    };
  }
}
