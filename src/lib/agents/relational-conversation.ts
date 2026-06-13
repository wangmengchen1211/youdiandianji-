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

  const fallback: RawReply = {
    assistant_reply: currentStagePlan?.sampleScript ?? "您好，我是小助理，来问候一声。",
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
