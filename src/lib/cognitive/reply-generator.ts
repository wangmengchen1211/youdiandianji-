// =====================================================================
// v2.1 Reply Generator — Step 3: GenerateReply
// 根据最终 action 生成自然话术，禁止机械模板
// =====================================================================
import { buildGenerateReplyPrompt } from "../prompts/generate-reply.prompt";
import { generateTextOutput } from "../services/llm.service";
import type { FinalDecisionOutput } from "../schemas/action-decision.schema";

const FALLBACK_REPLIES: Record<string, string> = {
  greet: "您好呀~我是念念，是家人设置的小助理~",
  ask_health_question: "阿姨最近身体怎么样呀？有没有哪里不舒服？",
  deliver_update: "对了对了，家人让我来跟您说声，最近天气变化大，注意加衣服呀~",
  remind_task: "对了，提醒您一下，今天的药记得吃哦~",
  confirm_task: "好的呀，记下来啦~",
  ask_relay: "对了，您有没有什么话想让我带给家人的呀？",
  listen_and_reflect: "嗯嗯，我听到了，您慢慢说~",
  close_call: "那不打扰您啦~家人一直惦记着您呢，您好好照顾自己呀~",
};

/**
 * 生成自然话术
 */
export async function generateReply(params: {
  decision: FinalDecisionOutput;
  elderUtterance: string;
  transcriptTail: string;
  familyContext: string;
  caregiverDisplayName: string;
  elderDisplayName: string;
  elderRelation: string;
  safetyConstraints: string;
}): Promise<{ text: string; source: "llm" | "fallback" }> {
  const {
    decision,
    elderUtterance,
    transcriptTail,
    familyContext,
    caregiverDisplayName,
    elderDisplayName,
    elderRelation,
    safetyConstraints,
  } = params;

  const prompt = buildGenerateReplyPrompt({
    final_stage: decision.final_stage,
    final_action: decision.final_action,
    elder_utterance: elderUtterance,
    transcript_tail: transcriptTail,
    family_context: familyContext,
    caregiver_display_name: caregiverDisplayName,
    elder_display_name: elderDisplayName,
    elder_relation: elderRelation,
    validation_override: decision.validation.override_reason,
    should_end_call: decision.should_end_call,
    safety_constraints: safetyConstraints,
  });

  const text = await generateTextOutput({
    prompt,
    userMessage: elderUtterance,
    agentName: "ReplyGenerator",
    temperature: 0.7, // 高温度：话术需要多样性
    fallback: FALLBACK_REPLIES[decision.final_action] ?? FALLBACK_REPLIES.ask_health_question,
  });

  // 判断是 LLM 还是 fallback
  const source: "llm" | "fallback" = text === (FALLBACK_REPLIES[decision.final_action] ?? FALLBACK_REPLIES.ask_health_question)
    ? "fallback"
    : "llm";

  return { text, source };
}
