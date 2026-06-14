/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/intent-situation-classifier.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { generateStructured } from "../llm/json-utils";
import { AgentRouterSchema } from "./schemas/agent-router.schema";
import { AGENT_ROUTER_PROMPT } from "./prompts/agent-router.prompt";
import type { AgentRouteResult, SituationAnalysis, FamilyContext, SituationType, RiskLevel } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof AgentRouterSchema>;

function convert(raw: RawOutput): AgentRouteResult {
  return {
    kind: raw.kind as AgentRouteResult["kind"],
    confidence: raw.confidence,
    reason: raw.reason,
    situationAnalysis: raw.situation_analysis
      ? {
          situationType: (raw.situation_analysis.situation_type ?? "unknown") as SituationType,
          secondaryTypes: [],
          riskLevel: (raw.situation_analysis.risk_level ?? "low") as RiskLevel,
          explicitNeed: raw.situation_analysis.explicit_need ?? "",
          implicitNeeds: [],
          missingInfo: [],
          recommendedStrategy: "ask_targeted_questions" as SituationAnalysis["recommendedStrategy"],
          forbiddenResponse: [],
        }
      : undefined,
  };
}

const FALLBACK_RAW: RawOutput = {
  kind: "unknown",
  confidence: 0.3,
  reason: "无法判断用户意图，需要更多信息",
};

/**
 * Agent Router - unified intent classifier.
 * Determines whether user input is: createTask, rewriteNote, querySummary,
 * addElder, deepCare, or unknown.
 * Used by both /api/agent and /api/companion/chat.
 */
export async function routeAgentRequest(
  userInput: string,
  context: FamilyContext
): Promise<AgentRouteResult> {
  const userPrompt = JSON.stringify({
    user_input: userInput,
    elder: context.elder,
    caregiver: context.caregiver,
    known_elders: [context.elder],
    open_care_cases: context.openCareCases.map((c) => ({
      id: c.id,
      caseType: c.caseType,
      summary: c.summary,
    })),
    recent_call_summaries: context.recentCallSummaries,  // P0-4: 通话历史
    recent_care_insights: context.recentCareInsights,    // P0-4: 亲情洞察
    memories: context.memories,                          // P0-4: 长期记忆
    relationship_profile: context.relationshipProfile,
  });

  try {
    const { data } = await generateStructured(
      [
        { role: "system", content: AGENT_ROUTER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      AgentRouterSchema,
      {
        agentName: "AgentRouter",
        fallback: FALLBACK_RAW,
        maxRetries: 1,
        llmOptions: { temperature: 0.2 },
      }
    );
    return convert(data);
  } catch {
    return convert(FALLBACK_RAW);
  }
}
