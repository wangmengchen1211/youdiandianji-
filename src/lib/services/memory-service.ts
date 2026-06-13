import { store } from "../store/memory-store";
import type { Memory, MemoryType } from "../store/types";

export function addMemory(params: {
  elderId?: string;
  caregiverId?: string;
  relationshipProfileId?: string;
  memoryType: MemoryType;
  content: string;
  confidence: number;
  importance: "low" | "medium" | "high";
  requiresReview: boolean;
  sourceType?: string;
  sourceId?: string;
}): Memory {
  const memory: Memory = {
    id: store.genId("mem"),
    familyId: store.familyId,
    elderId: params.elderId,
    caregiverId: params.caregiverId,
    relationshipProfileId: params.relationshipProfileId,
    memoryType: params.memoryType,
    content: params.content,
    confidence: params.confidence,
    importance: params.importance,
    requiresReview: params.requiresReview,
    reviewed: !params.requiresReview,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return store.addMemory(memory);
}

export function getMemoriesForElder(elderId: string): Memory[] {
  return store.getMemoriesForElder(elderId);
}

export function getExistingMemoryContents(elderId: string): string[] {
  return store.getMemoriesForElder(elderId).map((m) => m.content);
}
