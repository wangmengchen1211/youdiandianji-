/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/intent-situation-classifier.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { generateStructured } from "../llm/json-utils";
import { SituationRecognizerSchema } from "./schemas/situation-recognizer.schema";
import { SITUATION_RECOGNIZER_PROMPT } from "./prompts/situation-recognizer.prompt";
import type { SituationAnalysis, FamilyContext } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof SituationRecognizerSchema>;

function convert(raw: RawOutput): SituationAnalysis {
  return {
    situationType: raw.situation_type as SituationAnalysis["situationType"],
    secondaryTypes: raw.secondary_types as SituationAnalysis["secondaryTypes"],
    riskLevel: raw.risk_level as SituationAnalysis["riskLevel"],
    explicitNeed: raw.explicit_need,
    implicitNeeds: raw.implicit_needs,
    missingInfo: raw.missing_info,
    recommendedStrategy: raw.recommended_strategy as SituationAnalysis["recommendedStrategy"],
    forbiddenResponse: raw.forbidden_response,
  };
}

const FALLBACK_RAW: RawOutput = {
  situation_type: "unknown",
  secondary_types: [],
  risk_level: "low",
  explicit_need: "",
  implicit_needs: [],
  missing_info: ["需要更多信息来判断"],
  recommended_strategy: "ask_targeted_questions",
  forbidden_response: [],
};

/**
 * Situation Recognizer - identifies the situation type and risk level
 * from user input, providing the basis for deep care conversation flow.
 */
export async function recognizeSituation(
  userInput: string,
  context: FamilyContext
): Promise<SituationAnalysis> {
  const userPrompt = JSON.stringify({
    user_input: userInput,
    elder: context.elder,
    caregiver: context.caregiver,
    open_care_cases: context.openCareCases.map((c) => ({
      id: c.id,
      caseType: c.caseType,
      summary: c.summary,
      riskFlags: c.riskFlags,
    })),
    recent_call_summaries: context.recentCallSummaries,  // P0-4: 通话历史
    recent_care_insights: context.recentCareInsights,    // P0-4: 亲情洞察
    memories: context.memories,                          // P0-4: 长期记忆
    relationship_profile: context.relationshipProfile,
  });

  try {
    const { data } = await generateStructured(
      [
        { role: "system", content: SITUATION_RECOGNIZER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      SituationRecognizerSchema,
      {
        agentName: "SituationRecognizer",
        fallback: FALLBACK_RAW,
        maxRetries: 1,
      }
    );
    return convert(data);
  } catch {
    return convert(FALLBACK_RAW);
  }
}
