/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/services/context.service.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { store } from "../store/memory-store";
import type { RelationshipContext } from "../store/types";

/**
 * Relationship Context Composer - pure data assembly, no LLM calls.
 * Assembles elder profile, caregiver updates, relationship memory,
 * recent call summaries, and pending relay messages.
 */
export function composeRelationshipContext(
  elderId: string,
  caregiverId: string,
  taskObjectives: string[]
): RelationshipContext {
  const elder = store.getElder(elderId);
  const caregiver = store.getCaregiver(caregiverId);
  const relProfile = store.getRelationshipProfile(elderId, caregiverId);
  const updates = store.getUpdatesForCaregiver(caregiverId);
  const memories = store.getMemoriesForElder(elderId);
  const recentSummaries = store.getRecentCallSummaries(elderId);
  const pendingMessages = store.getPendingRelayMessages("elder", caregiverId);

  return {
    elderProfile: {
      elderId: elderId,
      displayName: elder?.displayName ?? "长辈",
      relation: elder?.relation ?? "unknown",
      communicationStyle:
        relProfile?.preferredContactStyle ??
        elder?.communicationPreference?.join("，") ??
        "温柔自然",
      preferences: elder?.communicationPreference ?? [],
      healthContext: elder?.healthFocus ?? [],
    },
    caregiverProfile: {
      caregiverId: caregiverId,
      displayName: caregiver?.displayName ?? "家属",
      recentUpdates: updates
        .filter((u) => u.canShareWithElder)
        .map((u) => ({
          content: u.content,
          canShareWithElder: u.canShareWithElder,
        })),
    },
    relationshipMemory: [
      ...(relProfile?.sharedMemories ?? []),
      ...memories
        .filter((m) => m.memoryType === "relationship_memory")
        .map((m) => m.content),
    ],
    recentCallSummaries: recentSummaries,
    pendingRelayMessages: pendingMessages.map((m) => ({
      from: m.fromType,
      to: m.toType,
      content: m.content,
      status: m.status,
    })),
    todayObjectives: taskObjectives,
  };
}
