// =====================================================================
// v2 Chat Workflow — 子女端主入口
// ContextService.forChat → SafetyService.preCheck → IntentSituationClassifier
// → SafetyService.mergePolicy → 路由到子 workflow
// =====================================================================
import * as contextService from "../services/context.service";
import * as safetyService from "../services/safety.service";
import { classifyIntentAndSituation } from "../cognitive/intent-situation-classifier";
import { generateDeepCareDialogue } from "../cognitive/deep-care-dialogue-engine";
import { extractTaskBlueprint } from "../cognitive/task-blueprint-extractor";
import type { WorkflowResult, SafetyPolicy } from "../store/types";

export type ChatWorkflowParams = {
  userInput: string;
  elderId: string;
  caregiverId: string;
  conversationHistory?: string[];
  forceIntent?: string;
  stillClassifySituation?: boolean;
};

/**
 * 子女端聊天主入口
 */
export async function handle(params: ChatWorkflowParams): Promise<WorkflowResult> {
  const {
    userInput,
    elderId,
    caregiverId,
    conversationHistory = [],
    forceIntent,
    stillClassifySituation = true,
  } = params;

  // 1. 组装上下文
  const ctx = contextService.forChat(elderId, caregiverId);

  // 2. SafetyService.preCheck（规则层初筛）
  const preCheckResult = safetyService.preCheck(userInput);

  // 3. IntentSituationClassifier（语义层分类 + 补充 safety_policy）
  const classification = await classifyIntentAndSituation({
    userInput,
    familyContext: ctx.serialized,
    safetyPolicy: preCheckResult.safetyPolicy,
    policyConstraints: safetyService.policyConstraint(preCheckResult.safetyPolicy),
    conversationHistory,
  });

  // 4. SafetyService.mergePolicy（合并两层 policy）
  const finalPolicy = safetyService.mergePolicy(
    preCheckResult.safetyPolicy,
    classification.safety_policy as SafetyPolicy[]
  );
  const constraints = safetyService.policyConstraint(finalPolicy);

  // 5. forceIntent 只强制 routing，不跳过 situation classification
  const intent = forceIntent ?? classification.intent;

  // 6. 根据 intent 路由到子 workflow
  switch (intent) {
    case "deep_care":
      return handleDeepCare(
        userInput,
        ctx,
        classification,
        finalPolicy,
        constraints,
        conversationHistory
      );

    case "create_task":
      return handleCreateTask(
        userInput,
        ctx,
        finalPolicy,
        constraints
      );

    default:
      // unknown / rewrite_note / query_summary / add_elder → 文本兜底
      return {
        kind: "text",
        content: classification.reason || "能再说说你想做什么吗？",
        meta: {
          intent: classification.intent,
          confidence: classification.confidence,
          situation: classification.situation,
        },
        safetyPolicy: finalPolicy,
        situationAnalysis: classification.situation as any,
      };
  }
}

// --- 子 workflow: 深度关怀 ---
async function handleDeepCare(
  userInput: string,
  ctx: contextService.ContextBundle,
  classification: any,
  finalPolicy: SafetyPolicy[],
  constraints: string[],
  conversationHistory: string[]
): Promise<WorkflowResult> {
  // SafetyService.policyConstraint 注入 Cognitive Skill
  const dialogue = await generateDeepCareDialogue({
    userInput,
    familyContext: ctx.serialized,
    safetyPolicy: finalPolicy,
    policyConstraints: constraints,
    situationAnalysis: classification.situation,
    conversationHistory,
    existingCase: ctx.familyContext.openCareCases[0]
      ? (ctx.familyContext.openCareCases[0] as any)
      : null,
  });

  // SafetyService.postCheck
  const safetyCheck = safetyService.postCheck(dialogue.reply);
  const finalReply =
    safetyCheck.action === "block"
      ? safetyCheck.sanitizedText
      : safetyCheck.action === "sanitize"
        ? safetyCheck.sanitizedText
        : dialogue.reply;

  return {
    kind: "deep_care",
    content: finalReply,
    data: {
      case_update: dialogue.case_update,
      suggested_actions: dialogue.suggested_actions,
    },
    meta: {
      situation: classification.situation,
    },
    safetyPolicy: finalPolicy,
    situationAnalysis: classification.situation as any,
    hookEvents: dialogue.hook_event?.should_emit
      ? [{ eventType: dialogue.hook_event.event_type as any, payload: dialogue.hook_event.payload }]
      : [],
  };
}

// --- 子 workflow: 创建任务 ---
async function handleCreateTask(
  userInput: string,
  ctx: contextService.ContextBundle,
  finalPolicy: SafetyPolicy[],
  constraints: string[]
): Promise<WorkflowResult> {
  const blueprint = await extractTaskBlueprint({
    userInput,
    familyContext: ctx.serialized,
    safetyPolicy: finalPolicy,
    policyConstraints: constraints,
  });

  if (blueprint.need_follow_up) {
    return {
      kind: "text",
      content: blueprint.follow_up_question || "能再说详细一点吗？",
      data: { missing_fields: blueprint.missing_fields },
      safetyPolicy: finalPolicy,
    };
  }

  return {
    kind: "task_draft",
    content: `我帮你拟好了「${blueprint.task_blueprint?.title ?? "提醒任务"}」，你看看对不对~`,
    data: {
      task_blueprint: blueprint.task_blueprint,
    },
    safetyPolicy: finalPolicy,
  };
}
