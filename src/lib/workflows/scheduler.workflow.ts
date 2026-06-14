// =====================================================================
// v2 Scheduler Workflow — 基于现有 scheduler-service 改造
// =====================================================================
import { store } from "../store/memory-store";
import type { WorkflowResult } from "../store/types";

/**
 * 调度器：检查到期任务并触发通话
 */
export async function run(): Promise<WorkflowResult[]> {
  const now = new Date();
  const results: WorkflowResult[] = [];

  const activeTasks = store.getActiveTaskTemplates();
  for (const task of activeTasks) {
    if (new Date(task.nextRunAt).getTime() > now.getTime()) continue;

    // 创建 occurrence
    const occurrence = store.addTaskOccurrence({
      id: store.genId("occ"),
      taskTemplateId: task.id,
      familyId: task.familyId,
      elderId: task.elderId,
      caregiverId: task.caregiverId,
      scheduledAt: now.toISOString(),
      status: "scheduled",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    // 更新 nextRunAt
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1); // 简单 daily +1
    store.updateTaskTemplate(task.id, {
      nextRunAt: nextRun.toISOString(),
    });

    results.push({
      kind: "text",
      content: `任务 ${task.title} 已调度，occurrence: ${occurrence.id}`,
      data: {
        taskTemplateId: task.id,
        occurrenceId: occurrence.id,
        elderId: task.elderId,
      },
    });
  }

  return results;
}
