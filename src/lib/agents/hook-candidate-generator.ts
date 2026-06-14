/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/workflows/hook.workflow.ts + src/lib/cognitive/hook-message-planner.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { generateStructured } from "../llm/json-utils";
import { HookCandidateSchema } from "./schemas/hook-candidate.schema";
import { HOOK_CANDIDATE_GENERATOR_PROMPT } from "./prompts/hook-candidate-generator.prompt";
import type { HookEvent, FamilyContext } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof HookCandidateSchema>;

const FALLBACK_RAW: RawOutput = {
  hook_type: "unknown",
  trigger_reason: "系统事件",
  message_goal: "温馨提醒",
  scheduled_minutes_from_now: 0,
  score: {
    importance: 0.5,
    timeliness: 0.5,
    relationship_value: 0.5,
    risk_level: 0.3,
    user_burden: 0.3,
    repetition_penalty: 0.1,
    intrusion_risk: 0.2,
    final_score: 0.5,
  },
};

/**
 * Hook Candidate Generator - uses LLM to evaluate whether a hook should be created.
 * Returns structured hook candidate data.
 */
export async function generateHookCandidate(
  event: HookEvent,
  context: FamilyContext
): Promise<RawOutput> {
  const userPrompt = JSON.stringify({
    event: {
      eventType: event.eventType,
      sourceType: event.sourceType,
      payload: event.payload,
    },
    elder: context.elder,
    caregiver: context.caregiver,
    open_care_cases: context.openCareCases.map((c) => ({
      id: c.id,
      caseType: c.caseType,
      status: c.status,
    })),
    recent_care_insights: context.recentCareInsights,
  });

  try {
    const { data } = await generateStructured(
      [
        { role: "system", content: HOOK_CANDIDATE_GENERATOR_PROMPT },
        { role: "user", content: userPrompt },
      ],
      HookCandidateSchema,
      {
        agentName: "HookCandidateGenerator",
        fallback: FALLBACK_RAW,
        maxRetries: 1,
      }
    );
    return data;
  } catch {
    return FALLBACK_RAW;
  }
}
