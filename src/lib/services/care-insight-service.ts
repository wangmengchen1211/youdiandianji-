import { store } from "../store/memory-store";
import type { CareInsight, CareInsightOutput } from "../store/types";

export function saveCareInsight(params: {
  elderId: string;
  caregiverId: string;
  callSessionId?: string;
  taskOccurrenceId?: string;
  insight: CareInsightOutput;
}): CareInsight {
  const ci: CareInsight = {
    id: store.genId("insight"),
    familyId: store.familyId,
    elderId: params.elderId,
    caregiverId: params.caregiverId,
    callSessionId: params.callSessionId,
    taskOccurrenceId: params.taskOccurrenceId,
    factualSummary: params.insight.factualSummary,
    relationshipInsight: params.insight.relationshipInsight,
    suggestedAction: params.insight.suggestedAction,
    suggestedMessage: params.insight.suggestedMessage,
    confidence: params.insight.confidence,
    createdAt: new Date().toISOString(),
  };

  return store.addCareInsight(ci);
}

export function getCareInsights(caregiverId?: string): CareInsight[] {
  return store.getCareInsights(caregiverId);
}
