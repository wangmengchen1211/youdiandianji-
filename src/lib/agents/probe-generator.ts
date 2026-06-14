/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/deep-care-dialogue-engine.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { callLLMTraced } from "../llm/llm-provider";
import { PROBE_GENERATOR_PROMPT } from "./prompts/probe-generator.prompt";
import type { SituationAnalysis, DepthPlan, FamilyContext } from "../store/types";

/**
 * Probe Generator - generates 1-3 natural, warm follow-up questions
 * based on situation analysis and depth plan.
 * Output is natural language text, not JSON.
 */
export async function generateProbes(
  userInput: string,
  situation: SituationAnalysis,
  depthPlan: DepthPlan,
  context: FamilyContext
): Promise<string[]> {
  const userPrompt = JSON.stringify({
    user_input: userInput,
    situation_analysis: {
      situationType: situation.situationType,
      riskLevel: situation.riskLevel,
      explicitNeed: situation.explicitNeed,
      missingInfo: situation.missingInfo,
    },
    depth_plan: {
      goal: depthPlan.goal,
      askDimensions: depthPlan.askDimensions,
      questions: depthPlan.questions,
    },
    elder: {
      displayName: context.elder.displayName,
      relation: context.elder.relation,
      healthContext: context.elder.healthContext,
    },
    recent_call_summaries: context.recentCallSummaries,  // P0-4: 通话历史
    recent_care_insights: context.recentCareInsights,    // P0-4: 亲情洞察
    memories: context.memories,                          // P0-4: 长期记忆
    relationship_profile: context.relationshipProfile,
  });

  try {
    const raw = await callLLMTraced(
      [
        { role: "system", content: PROBE_GENERATOR_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { agentName: "ProbeGenerator", temperature: 0.5 }
    );

    // Parse: each line is a probe question
    return raw
      .split("\n")
      .map((line) => line.replace(/^[-•*\d.]+\s*/, "").trim())
      .filter((line) => line.length > 5 && line.length < 200)
      .slice(0, 3);
  } catch {
    return depthPlan.questions.slice(0, 2);
  }
}
