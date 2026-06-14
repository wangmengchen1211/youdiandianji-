// =====================================================================
// v2 HookMessagePlanner — 只负责生成候选文案
// 不负责评分和发送决策
// =====================================================================
import { HookMessagePlannerSchema, HookMessagePlannerOutput } from "../schemas/hook.schema";
import { buildHookMessagePlannerPrompt } from "../prompts/hook-message-planner.prompt";
import { generateStructuredOutput } from "../services/llm.service";

const FALLBACK: HookMessagePlannerOutput = {
  message: "我帮你记下来了，有空的时候可以看看。",
  reason: "兜底消息",
  delivery_hint: "in_app",
  trigger_event: "",
  why_now: "事件触发",
  message_goal: "提醒家属关注",
  risk_notes: [],
};

export async function planHookMessage(params: {
  hookEvent: Record<string, unknown>;
  score: Record<string, unknown>;
  familyContext: string;
  safetyPolicy: string[];
  policyConstraints: string[];
}): Promise<HookMessagePlannerOutput> {
  const prompt = buildHookMessagePlannerPrompt({
    family_context: params.familyContext,
    safety_policy: params.safetyPolicy,
    policy_constraints: params.policyConstraints,
    hook_event: params.hookEvent,
    score: params.score,
  });

  const { data } = await generateStructuredOutput({
    prompt,
    schema: HookMessagePlannerSchema,
    input: params.hookEvent,
    fallback: FALLBACK,
    agentName: "HookMessagePlanner",
    temperature: 0.3,
    maxRetries: 1,
  });

  return data;
}
