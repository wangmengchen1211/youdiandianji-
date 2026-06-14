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

// =====================================================================
// v2 扩展接口
// =====================================================================

/**
 * 获取某个通话的 CareInsight
 */
export function getByCallSession(callSessionId: string): CareInsight | undefined {
  const all = store.getCareInsights();
  return all.find((ci) => ci.callSessionId === callSessionId);
}

/**
 * 获取指定 caregiver 最近的 CareInsight（限制数量）
 */
export function getRecentByCaregiver(
  caregiverId: string,
  limit = 10
): CareInsight[] {
  const all = store
    .getCareInsights(caregiverId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  return all.slice(0, limit);
}

/**
 * 标记已读（MVP 阶段：直接标记 reviewed 字段）
 */
export function markRead(insightId: string): void {
  const all = store.getCareInsights();
  const insight = all.find((ci) => ci.id === insightId);
  if (insight) {
    // MVP: use structuredValue as read marker
    (insight as any)._read = true;
  }
}
