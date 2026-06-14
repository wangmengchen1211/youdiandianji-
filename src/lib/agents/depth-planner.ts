/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/deep-care-dialogue-engine.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { generateStructured } from "../llm/json-utils";
import { DepthPlannerSchema } from "./schemas/depth-planner.schema";
import { DEPTH_PLANNER_PROMPT } from "./prompts/depth-planner.prompt";
import type { SituationAnalysis, DepthPlan, FamilyContext } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof DepthPlannerSchema>;

function convert(raw: RawOutput): DepthPlan {
  return {
    conversationStage: raw.conversation_stage,
    goal: raw.goal,
    askDimensions: raw.ask_dimensions,
    questions: raw.questions,
    responseStyle: raw.response_style,
    shouldCreateCase: raw.should_create_case,
    caseType: raw.case_type,
  };
}

const FALLBACK_RAW: RawOutput = {
  conversation_stage: "初次了解",
  goal: "了解家属的具体担忧",
  ask_dimensions: ["具体情况", "最近变化"],
  questions: ["能再说说具体是什么情况吗？"],
  response_style: "warm_and_natural",
  should_create_case: false,
};

/**
 * Depth Planner - plans a deep care conversation path based on
 * situation analysis and conversation history.
 */
export async function planDepth(
  situation: SituationAnalysis,
  conversationHistory: { role: string; content: string }[],
  context: FamilyContext
): Promise<DepthPlan> {
  const userPrompt = JSON.stringify({
    situation_analysis: situation,
    conversation_history: conversationHistory.slice(-6),
    elder: context.elder,
    caregiver: context.caregiver,
    open_care_cases: context.openCareCases.map((c) => ({
      id: c.id,
      caseType: c.caseType,
      knownFacts: c.knownFacts,
      unknowns: c.unknowns,
    })),
    recent_call_summaries: context.recentCallSummaries,  // P0-4: 通话历史
    recent_care_insights: context.recentCareInsights,    // P0-4: 亲情洞察
    memories: context.memories,                          // P0-4: 长期记忆
    relationship_profile: context.relationshipProfile,
  });

  try {
    const { data } = await generateStructured(
      [
        { role: "system", content: DEPTH_PLANNER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      DepthPlannerSchema,
      {
        agentName: "DepthPlanner",
        fallback: FALLBACK_RAW,
        maxRetries: 1,
      }
    );
    return convert(data);
  } catch {
    return convert(FALLBACK_RAW);
  }
}
