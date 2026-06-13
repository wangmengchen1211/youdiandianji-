import { store } from "../store/memory-store";
import type { TaskTemplate, TaskBlueprint } from "../store/types";

function computeNextRunAt(rule: TaskTemplate["recurrenceRule"], fromTime?: string): string {
  const base = fromTime ? new Date(fromTime) : new Date();
  const [hours, minutes] = rule.time.split(":").map(Number);

  // Set to today at the specified time
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, move to tomorrow
  if (next <= base) {
    next.setDate(next.getDate() + 1);
  }

  if (rule.type === "weekly" && rule.daysOfWeek?.length) {
    // Find the next matching day of week
    const today = next.getDay();
    const sorted = [...rule.daysOfWeek].sort((a, b) => a - b);
    const nextDay = sorted.find((d) => d > today) ?? sorted[0];
    const daysToAdd = nextDay > today ? nextDay - today : 7 - today + nextDay;
    next.setDate(next.getDate() + daysToAdd);
  }

  return next.toISOString();
}

export function createTaskTemplate(blueprint: TaskBlueprint, caregiverId: string): TaskTemplate {
  const template: TaskTemplate = {
    id: store.genId("tpl"),
    familyId: store.familyId,
    elderId: blueprint.elderId,
    caregiverId,
    title: blueprint.title,
    taskType: blueprint.taskType,
    recurrenceRule: blueprint.recurrenceRule,
    primaryObjectives: blueprint.primaryObjectives,
    relationshipObjectives: blueprint.relationshipObjectives,
    requiredSlots: blueprint.requiredSlots,
    retryPolicy: blueprint.retryPolicy,
    callPolicy: blueprint.callPolicy,
    status: "active",
    nextRunAt: computeNextRunAt(blueprint.recurrenceRule),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return store.addTaskTemplate(template);
}

export function getTaskTemplate(id: string): TaskTemplate | undefined {
  return store.getTaskTemplate(id);
}

export function getActiveTaskTemplates(): TaskTemplate[] {
  return store.getActiveTaskTemplates();
}

export function getAllTaskTemplates(): TaskTemplate[] {
  return store.taskTemplates;
}

export function advanceNextRunAt(templateId: string): void {
  const template = store.getTaskTemplate(templateId);
  if (!template) return;

  const newNextRun = computeNextRunAt(template.recurrenceRule, template.nextRunAt);
  store.updateTaskTemplate(templateId, { nextRunAt: newNextRun });
}
