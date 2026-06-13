import { store } from "../store/memory-store";
import { getActiveTaskTemplates, advanceNextRunAt } from "./task-template-service";
import { createOccurrence, hasExistingOccurrence } from "./task-occurrence-service";
import { startCall } from "./call-orchestrator";

export type SchedulerTickResult = {
  triggered: {
    taskOccurrenceId: string;
    callSessionId: string;
    elderDisplayName: string;
    status: string;
  }[];
  skipped: {
    templateId: string;
    reason: string;
  }[];
};

/**
 * Manual scheduler tick for Demo.
 * Scans all due task_templates, creates occurrences, and starts calls.
 * Idempotent: won't create duplicate occurrences for the same scheduled time.
 */
export async function schedulerTick(now?: string): Promise<SchedulerTickResult> {
  const currentTime = now ? new Date(now) : new Date();
  const templates = getActiveTaskTemplates();
  const result: SchedulerTickResult = { triggered: [], skipped: [] };

  for (const template of templates) {
    const nextRun = new Date(template.nextRunAt);

    // Skip if not yet due
    if (nextRun > currentTime) {
      result.skipped.push({
        templateId: template.id,
        reason: `Not due yet. nextRunAt=${template.nextRunAt}`,
      });
      continue;
    }

    // Check idempotency - don't create duplicate occurrences
    if (hasExistingOccurrence(template.id, template.nextRunAt)) {
      result.skipped.push({
        templateId: template.id,
        reason: "Occurrence already exists for this scheduled time.",
      });
      continue;
    }

    // Create occurrence
    const occ = createOccurrence(template.id, template.nextRunAt);

    // Start call
    try {
      const { callSession } = await startCall(occ.id);
      const elder = store.getElder(template.elderId);

      result.triggered.push({
        taskOccurrenceId: occ.id,
        callSessionId: callSession.id,
        elderDisplayName: elder?.displayName ?? "长辈",
        status: callSession.status,
      });
    } catch (err) {
      result.skipped.push({
        templateId: template.id,
        reason: `Call failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  return result;
}
