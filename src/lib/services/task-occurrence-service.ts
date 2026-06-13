import { store } from "../store/memory-store";
import type { TaskOccurrence, TaskResult, OccurrenceStatus } from "../store/types";

export function createOccurrence(
  taskTemplateId: string,
  scheduledAt: string
): TaskOccurrence {
  const template = store.getTaskTemplate(taskTemplateId);
  if (!template) throw new Error(`Task template ${taskTemplateId} not found`);

  const occ: TaskOccurrence = {
    id: store.genId("occ"),
    taskTemplateId,
    familyId: template.familyId,
    elderId: template.elderId,
    caregiverId: template.caregiverId,
    scheduledAt,
    status: "scheduled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return store.addTaskOccurrence(occ);
}

export function updateOccurrenceStatus(
  id: string,
  status: OccurrenceStatus,
  result?: TaskResult,
  callSessionId?: string
): TaskOccurrence | undefined {
  return store.updateTaskOccurrence(id, {
    status,
    ...(result ? { result } : {}),
    ...(callSessionId ? { callSessionId } : {}),
  });
}

export function getOccurrence(id: string): TaskOccurrence | undefined {
  return store.getTaskOccurrence(id);
}

export function getOccurrencesForTemplate(templateId: string): TaskOccurrence[] {
  return store.getOccurrencesForTemplate(templateId);
}

export function hasExistingOccurrence(
  templateId: string,
  scheduledAt: string
): boolean {
  const occurrences = store.getOccurrencesForTemplate(templateId);
  return occurrences.some((o) => o.scheduledAt === scheduledAt);
}
