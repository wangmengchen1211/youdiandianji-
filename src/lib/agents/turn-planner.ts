/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/call-turn-engine.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { generateStructured } from "../llm/json-utils";
import { TurnPlannerSchema } from "./schemas/turn-planner.schema";
import { TURN_PLANNER_PROMPT } from "./prompts/turn-planner.prompt";
import type {
  CallPlan,
  ConversationState,
  FamilyContext,
  TranscriptEntry,
  TurnPlanOutput,
} from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof TurnPlannerSchema>;

function convert(raw: RawOutput): TurnPlanOutput {
  return {
    analysis: {
      factualInfo: raw.analysis.factual_info,
      taskSlots: raw.analysis.task_slots,
      relationshipSignals: raw.analysis.relationship_signals.map((s) => ({
        type: s.type,
        content: s.content,
        evidence: s.evidence,
        confidence: s.confidence,
      })),
      emotion: {
        label: raw.analysis.emotion.label,
        evidence: raw.analysis.emotion.evidence,
        confidence: raw.analysis.emotion.confidence,
      },
      probeOpportunities: raw.analysis.probe_opportunities.map((p) => ({
        type: p.type,
        questionGoal: p.question_goal,
        priority: p.priority,
      })),
      stageCompleted: raw.analysis.stage_completed,
      shouldEndCall: raw.analysis.should_end_call,
    },
    next: {
      action: raw.next.action,
      stage: raw.next.stage,
      reason: raw.next.reason,
      assistantText: raw.next.assistant_text,
      isCallEnding: raw.next.is_call_ending,
    },
    statePatch: {
      taskSlots: raw.state_patch.task_slots,
      relationshipSlots: raw.state_patch.relationship_slots,
      probeBudget: raw.state_patch.probe_budget,
      elderWillingness: raw.state_patch.elder_willingness,
      shouldCloseSoon: raw.state_patch.should_close_soon,
    },
    memoryCandidates: raw.memory_candidates.map((m) => ({
      type: m.type,
      content: m.content,
      confidence: m.confidence,
      requiresReview: m.requires_review,
    })),
  };
}

/**
 * P2-7: 智能兜底——根据 stage + elder 上句生成不模板化的回复
 * 输入：当前 transcript、conversationState
 * 输出：RawOutput 类型的 FALLBACK
 */
function buildFallback(
  transcript: TranscriptEntry[],
  conversationState: ConversationState
): RawOutput {
  const lastElderUtterance = [...transcript]
    .reverse()
    .find((t) => t.speaker === "elder")?.text ?? "";
  const slots = Object.keys(conversationState.taskSlots);
  const eText = lastElderUtterance;
  const eHas = (kw: string) => eText.includes(kw);
  const stageFallbackText: Record<string, (e: string) => string> = {
    identity_and_consent: () => "阿姨/叔叔您好，我是念念，是家人设置的小助理念念，方便聊几句吗？",
    warm_greeting: (e) => e ? "嗯嗯，您最近身体都好吧？" : "您最近身体都好吧？",
    child_update: () => "家人让我跟您说，最近一切都好，让您放心~",
    open_care_question: (e) => e
      ? `${eHas("好") || eHas("行") ? "听您这么说我就放心啦~" : "我记下来啦~"} 您还吃得好睡得好吧？`
      : "您最近身体怎么样呀？有没有哪里不太舒服的？",
    listen_and_reflect: (e) => e ? "嗯，我听着呢。您慢慢说。" : "嗯嗯，我在听，您说。",
    task_reminder: (e) => e
      ? (eHas("没") || eHas("忘") ? "没事没事，下次记得就好。" : "好的，记下来啦~")
      : "对了，今天的情况怎么样？我帮您记一下~",
    confirm_task: (e) => e
      ? (eHas("没") || eHas("不") ? "嗯嗯没关系，下次再说。" : "好的，记下来啦~")
      : "好的，记下来啦~",
    ask_relay_message: () => "对了，家人有没有什么想跟您说的？要不要我帮您转告？",
    closing: () => "好嘞，今天先到这儿。您注意身体，家人惦记您~",
    post_call_analysis: () => "好的，我先整理一下今天的聊天内容。",
  };
  const fallbackText =
    stageFallbackText[conversationState.stage]?.(lastElderUtterance) ?? "嗯嗯，我在听~";
  const shouldEnd = conversationState.shouldCloseSoon && conversationState.turnCount >= 8;
  return {
    analysis: {
      factual_info: {},
      task_slots: {},
      relationship_signals: [],
      emotion: { label: "neutral", evidence: lastElderUtterance, confidence: 0.5 },
      probe_opportunities: [],
      stage_completed: slots.length > 0,
      should_end_call: shouldEnd,
    },
    next: {
      action: shouldEnd ? "close_call" : "continue",
      stage: shouldEnd ? "closing" : conversationState.stage,
      reason: "fallback",
      assistant_text: fallbackText,
      is_call_ending: shouldEnd,
    },
    state_patch: {},
    memory_candidates: [],
  };
}

/**
 * Turn Planner - merged analysis + planning + generation in one LLM call.
 * This is the core of the call conversation flow (Section 15 of design doc).
 */
export async function planTurn(
  elderText: string,
  callPlan: CallPlan,
  conversationState: ConversationState,
  context: FamilyContext,
  transcript: TranscriptEntry[]
): Promise<TurnPlanOutput> {
  const currentStagePlan = callPlan.stages.find(
    (s) => s.stage === conversationState.stage
  );

  const userPrompt = JSON.stringify({
    elder_text: elderText,
    elder: context.elder,
    caregiver: context.caregiver,
    current_stage: conversationState.stage,
    current_stage_goal: currentStagePlan?.goal ?? "",
    current_stage_sample: currentStagePlan?.sampleScript ?? "",
    transcript: transcript.slice(-8).map((t) => ({
      speaker: t.speaker,
      text: t.text,
    })),
    task_slots_collected: conversationState.taskSlots,
    turn_count: conversationState.turnCount,
    probe_budget: conversationState.probeBudget,
    elder_willingness: conversationState.elderWillingness,
    should_close_soon: conversationState.shouldCloseSoon,
    elapsed_seconds: conversationState.elapsedSeconds,
    relationship_memory: context.relationshipProfile?.sharedMemories ?? [],
    sensitive_topics: context.relationshipProfile?.sensitiveTopics ?? [],
  });

  const fallback = buildFallback(transcript, conversationState);

  try {
    const { data } = await generateStructured(
      [
        { role: "system", content: TURN_PLANNER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      TurnPlannerSchema,
      {
        agentName: "TurnPlanner",
        fallback,
        maxRetries: 1,
      }
    );
    return convert(data);
  } catch {
    return convert(fallback);
  }
}
