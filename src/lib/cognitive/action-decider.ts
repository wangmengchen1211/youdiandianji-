// =====================================================================
// v2.1 Action Decider — Step 2: DecideNextAction
// LLM 提议 → 状态机安全校验 → 最终决策
// 核心理念：LLM 提议，状态机校验（而不是状态机拍板，LLM 填空）
// =====================================================================
import {
  ActionProposalSchema,
  type ActionProposalOutput,
  type FinalDecisionOutput,
} from "../schemas/action-decision.schema";
import type { TurnIntentOutput } from "../schemas/turn-intent.schema";
import { buildActionProposalPrompt } from "../prompts/action-proposal.prompt";
import { generateStructuredOutput } from "../services/llm.service";
import type { CallStage, ConversationState } from "../store/types";

// listen_and_reflect 最多停留轮数
const LISTEN_AND_REFLECT_MAX_TURNS = 1;

// 通话硬上限
const MAX_ELAPSED_SECONDS = 240; // 4分钟
const MAX_TURN_COUNT = 12;

const PROPOSAL_FALLBACK: ActionProposalOutput = {
  proposed_stage: "open_care_question",
  proposed_action: "ask_health_question",
  reason: "LLM 调用失败，fallback 到关心状态",
  should_end_call: false,
  observations: [],
  state_patch: {},
  safety_level: "safe",
};

/**
 * 状态机安全校验
 * 只校验硬性条件，不替 LLM 做语义判断
 */
function validateProposal(
  proposal: ActionProposalOutput,
  intent: TurnIntentOutput,
  state: ConversationState
): { valid: boolean; overrideReason: string; hardLimitHit: boolean } {
  // --- 硬上限检查（不可覆盖）---

  // 长辈明确拒绝
  if (intent.intent === "end_requested" || state.elderWillingness === "refused") {
    return {
      valid: false,
      overrideReason: "长辈明确拒绝，强制结束通话",
      hardLimitHit: true,
    };
  }

  // 超时
  if (state.elapsedSeconds > MAX_ELAPSED_SECONDS) {
    return {
      valid: false,
      overrideReason: `超过最大时长 ${MAX_ELAPSED_SECONDS}秒，强制结束`,
      hardLimitHit: true,
    };
  }

  // 超轮次
  if (state.turnCount > MAX_TURN_COUNT) {
    return {
      valid: false,
      overrideReason: `超过最大轮次 ${MAX_TURN_COUNT}轮，强制结束`,
      hardLimitHit: true,
    };
  }

  // --- listen_and_reflect 粘滞检查 ---
  if (proposal.proposed_stage === "listen_and_reflect") {
    const listenTurns = state.completedStages.filter(
      (s) => s === "listen_and_reflect"
    ).length;

    if (listenTurns >= LISTEN_AND_REFLECT_MAX_TURNS) {
      return {
        valid: false,
        overrideReason: `listen_and_reflect 已停留 ${listenTurns} 轮，回到 task_reminder`,
        hardLimitHit: false,
      };
    }
  }

  return { valid: true, overrideReason: "", hardLimitHit: false };
}

/**
 * 构造最终决策
 */
function buildFinalDecision(
  proposal: ActionProposalOutput,
  validation: { valid: boolean; overrideReason: string; hardLimitHit: boolean },
  intent: TurnIntentOutput,
  state: ConversationState
): FinalDecisionOutput {
  // 硬上限触发：强制结束
  if (validation.hardLimitHit) {
    return {
      final_stage: "closing",
      final_action: "close_call",
      validation: {
        passed: false,
        hard_limit_hit: true,
        override_reason: validation.overrideReason,
      },
      should_end_call: true,
      observations: proposal.observations,
      state_patch: {
        ...proposal.state_patch,
        elder_willingness: intent.intent === "end_requested" ? "refused" : proposal.state_patch.elder_willingness,
      },
      safety_level: proposal.safety_level,
    };
  }

  // listen_and_reflect 粘滞：回退到 task_reminder
  if (!validation.valid && proposal.proposed_stage === "listen_and_reflect") {
    return {
      final_stage: "task_reminder",
      final_action: "remind_task",
      validation: {
        passed: false,
        hard_limit_hit: false,
        override_reason: validation.overrideReason,
      },
      should_end_call: false,
      observations: proposal.observations,
      state_patch: proposal.state_patch,
      safety_level: proposal.safety_level,
    };
  }

  // 正常情况：接受 LLM 提议
  return {
    final_stage: proposal.proposed_stage as CallStage,
    final_action: proposal.proposed_action,
    validation: {
      passed: true,
      hard_limit_hit: false,
      override_reason: "",
    },
    should_end_call: proposal.should_end_call,
    observations: proposal.observations,
    state_patch: proposal.state_patch,
    safety_level: proposal.safety_level,
  };
}

/**
 * 决策主函数
 * Step 2a: LLM 提议 → Step 2b: 状态机校验
 */
export async function decideNextAction(params: {
  intent: TurnIntentOutput;
  currentState: ConversationState;
  familyContext: string;
  transcript: string;
  elderUtterance: string;
  safetyPolicy: string;
  policyConstraints: string;
  caregiverDisplayName: string;
  elderDisplayName: string;
  taskContext: string;
}): Promise<FinalDecisionOutput> {
  const {
    intent,
    currentState,
    familyContext,
    transcript,
    elderUtterance,
    safetyPolicy,
    policyConstraints,
    caregiverDisplayName,
    elderDisplayName,
    taskContext,
  } = params;

  // Step 2a: LLM 提议
  const prompt = buildActionProposalPrompt({
    family_context: familyContext,
    current_stage: currentState.stage,
    transcript,
    elder_utterance: elderUtterance,
    intent: intent.intent,
    intent_confidence: intent.confidence,
    intent_evidence: intent.evidence,
    negation_detected: intent.negation_detected,
    emotion_detected: intent.emotion_detected,
    emotion_label: intent.emotion_label,
    factual_info: JSON.stringify(intent.factual_info),
    task_slots: JSON.stringify(intent.task_slots),
    call_state: JSON.stringify({
      stage: currentState.stage,
      turnCount: currentState.turnCount,
      taskSlots: currentState.taskSlots,
      probeBudget: currentState.probeBudget,
      elderWillingness: currentState.elderWillingness,
      shouldCloseSoon: currentState.shouldCloseSoon,
    }),
    safety_policy: safetyPolicy,
    policy_constraints: policyConstraints,
    caregiver_display_name: caregiverDisplayName,
    elder_display_name: elderDisplayName,
    elapsed_seconds: currentState.elapsedSeconds,
    turn_count: currentState.turnCount,
  });

  const { data: proposal } = await generateStructuredOutput({
    prompt,
    schema: ActionProposalSchema,
    input: {
      elder_utterance: elderUtterance,
      intent: intent.intent,
      current_stage: currentState.stage,
    },
    fallback: PROPOSAL_FALLBACK,
    agentName: "ActionProposal",
    temperature: 0.3,
    maxRetries: 1,
  });

  // Step 2b: 状态机安全校验
  const validation = validateProposal(proposal, intent, currentState);

  // 构造最终决策
  return buildFinalDecision(proposal, validation, intent, currentState);
}
