/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/cognitive/task-blueprint-extractor.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { llmStructuredCall } from "../llm/json-utils";
import { TaskBlueprintSchema } from "./schemas/task-designer.schema";
import { TASK_DESIGNER_PROMPT } from "./prompts/task-designer.prompt";
import type { TaskDesignInput, TaskDesignOutput, TaskBlueprint } from "../store/types";
import type { z } from "zod";

type RawOutput = z.infer<typeof TaskBlueprintSchema>;

function convertBlueprint(raw: RawOutput["task_blueprint"]): TaskBlueprint | null {
  if (!raw) return null;
  return {
    elderId: raw.elder_id,
    elderDisplayName: raw.elder_display_name,
    title: raw.title,
    taskType: raw.task_type,
    recurrenceRule: raw.recurrence_rule,
    primaryObjectives: raw.primary_objectives.map((o) => ({
      type: o.type as TaskBlueprint["primaryObjectives"][0]["type"],
      content: o.content,
    })),
    relationshipObjectives: raw.relationship_objectives.map((o) => ({
      type: o.type as TaskBlueprint["relationshipObjectives"][0]["type"],
      content: o.content,
    })),
    requiredSlots: raw.required_slots,
    retryPolicy: {
      maxAttempts: raw.retry_policy.max_attempts,
      retryAfterMinutes: raw.retry_policy.retry_after_minutes,
    },
    callPolicy: {
      maxDurationSeconds: raw.call_policy.max_duration_seconds,
      maxExtraQuestions: raw.call_policy.max_extra_questions,
      tone: raw.call_policy.tone,
    },
  };
}

function toOutput(raw: RawOutput): TaskDesignOutput {
  return {
    intent: raw.intent,
    needFollowUp: raw.need_follow_up,
    followUpQuestion: raw.follow_up_question,
    missingFields: raw.missing_fields,
    taskBlueprint: convertBlueprint(raw.task_blueprint),
  };
}

export async function designTask(input: TaskDesignInput): Promise<TaskDesignOutput> {
  const userPrompt = JSON.stringify({
    user_text: input.text,
    current_elder_id: input.currentElderId,
    known_elders: input.knownElders,
  });

  const rawFallback: RawOutput = {
    intent: "create_daily_care_call",
    need_follow_up: true,
    missing_fields: ["unknown"],
    follow_up_question: "你可以再说具体一点吗？比如提醒谁、什么时间、什么事？",
    task_blueprint: null,
  };

  try {
    const { data } = await llmStructuredCall(
      [
        { role: "system", content: TASK_DESIGNER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      TaskBlueprintSchema,
      { fallback: rawFallback, maxRetries: 1 }
    );

    return toOutput(data);
  } catch {
    return toOutput(rawFallback);
  }
}
