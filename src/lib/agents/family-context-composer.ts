/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/services/context.service.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { store } from "../store/memory-store";
import type { FamilyContext } from "../store/types";

/**
 * Family Context Composer - unified context loader for all Agents.
 * Assembles a complete FamilyContext from the memory store.
 * All new Agent modules should receive FamilyContext via this composer,
 * rather than fetching data from MemoryStore individually.
 */
export function composeFamilyContext(
  elderId: string,
  caregiverId: string,
  taskObjectives?: string[]
): FamilyContext {
  const elder = store.getElder(elderId);
  const caregiver = store.getCaregiver(caregiverId);
  const relProfile = store.getRelationshipProfile(elderId, caregiverId);
  const updates = store.getUpdatesForCaregiver(caregiverId);
  const memories = store.getMemoriesForElder(elderId);
  const recentSummaries = store.getRecentCallSummaries(elderId);
  const pendingMessages = store.getPendingRelayMessages("elder", caregiverId);
  const careInsights = store.getCareInsights(caregiverId);

  // Get open care cases (store may not have them yet before Phase E)
  const openCareCases = typeof (store as any).getOpenCareCases === "function"
    ? (store as any).getOpenCareCases(elderId) as FamilyContext["openCareCases"]
    : [];

  return {
    familyId: elder?.familyId ?? caregiver?.familyId ?? "unknown",
    caregiver: {
      caregiverId,
      displayName: caregiver?.displayName ?? "家属",
      recentUpdates: updates
        .filter((u) => u.canShareWithElder)
        .map((u) => ({
          content: u.content,
          canShareWithElder: u.canShareWithElder,
        })),
    },
    elder: {
      elderId,
      displayName: elder?.displayName ?? "长辈",
      relation: elder?.relation ?? "unknown",
      communicationStyle:
        relProfile?.preferredContactStyle ??
        elder?.communicationPreference?.join("，") ??
        "温柔自然",
      preferences: elder?.communicationPreference ?? [],
      healthContext: elder?.healthFocus ?? [],
    },
    relationshipProfile: relProfile
      ? {
          sharedMemories: relProfile.sharedMemories ?? [],
          sensitiveTopics: relProfile.sensitiveTopics ?? [],
          preferredContactStyle: relProfile.preferredContactStyle ?? "温柔自然",
        }
      : undefined,
    memories: memories.map((m) => ({
      type: m.memoryType,
      content: m.content,
      importance: m.importance,
    })),
    openCareCases,
    recentCallSummaries: recentSummaries,
    recentCareInsights: careInsights
      .slice(-5)
      .map((i) => ({
        factualSummary: i.factualSummary,
        relationshipInsight: i.relationshipInsight,
      })),
    pendingRelayMessages: pendingMessages.map((m) => ({
      from: m.fromType,
      to: m.toType,
      content: m.content,
      status: m.status,
    })),
    todayObjectives: taskObjectives ?? [],
    userStyle: {
      tone: caregiver?.writingStyle ?? "natural_warm",
      avoid: relProfile?.sensitiveTopics ?? [],
      desired: relProfile?.toneProfile ?? ["温暖", "自然"],
    },
  };
}
