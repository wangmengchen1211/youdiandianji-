/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/deep-care-dialogue-engine.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { generateStructured } from "../llm/json-utils";
import { CaseFormulationSchema } from "./schemas/case-formulation.schema";
import { CASE_FORMULATION_BUILDER_PROMPT } from "./prompts/case-formulation-builder.prompt";
import type { CaseFormulationUpdate, CareCase, FamilyContext } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof CaseFormulationSchema>;

function convert(raw: RawOutput): CaseFormulationUpdate {
  return {
    newKnownFacts: raw.new_known_facts,
    updatedUnknowns: raw.updated_unknowns,
    newRiskFlags: raw.new_risk_flags.map((f) => ({
      type: f.type,
      content: f.content,
      level: f.level,
    })),
    updatedNextSteps: raw.updated_next_steps,
    followUpAt: raw.follow_up_at,
    statusChange: raw.status_change as CaseFormulationUpdate["statusChange"],
  };
}

const FALLBACK_RAW: RawOutput = {
  new_known_facts: [],
  updated_unknowns: [],
  new_risk_flags: [],
  updated_next_steps: [],
};

/**
 * Case Formulation Builder - extracts structured updates for a CareCase
 * from multi-turn conversation. Appends new facts, updates unknowns,
 * and flags new risks.
 */
export async function buildCaseFormulation(
  conversationHistory: { role: string; content: string }[],
  existingCase: CareCase | null,
  context: FamilyContext
): Promise<CaseFormulationUpdate> {
  const userPrompt = JSON.stringify({
    conversation_history: conversationHistory.slice(-8),
    existing_case: existingCase
      ? {
          id: existingCase.id,
          caseType: existingCase.caseType,
          summary: existingCase.summary,
          knownFacts: existingCase.knownFacts,
          unknowns: existingCase.unknowns,
          riskFlags: existingCase.riskFlags,
          nextSteps: existingCase.nextSteps,
          status: existingCase.status,
        }
      : null,
    elder: context.elder,
    caregiver: context.caregiver,
    recent_call_summaries: context.recentCallSummaries,  // P0-4: 通话历史
    recent_care_insights: context.recentCareInsights,    // P0-4: 亲情洞察
    memories: context.memories,                          // P0-4: 长期记忆
  });

  try {
    const { data } = await generateStructured(
      [
        { role: "system", content: CASE_FORMULATION_BUILDER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      CaseFormulationSchema,
      {
        agentName: "CaseFormulationBuilder",
        fallback: FALLBACK_RAW,
        maxRetries: 1,
      }
    );
    return convert(data);
  } catch {
    return convert(FALLBACK_RAW);
  }
}
