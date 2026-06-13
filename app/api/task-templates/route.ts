import { NextResponse } from "next/server";
import { getAllTaskTemplates, createTaskTemplate } from "@/src/lib/services/task-template-service";
import type { TaskBlueprint } from "@/src/lib/store/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAllTaskTemplates());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Convert API body to TaskBlueprint
    const blueprint: TaskBlueprint = {
      elderId: body.elder_id,
      elderDisplayName: body.elder_display_name,
      title: body.title,
      taskType: body.task_type ?? "daily_care_call",
      recurrenceRule: body.recurrence_rule,
      primaryObjectives: body.primary_objectives ?? [],
      relationshipObjectives: body.relationship_objectives ?? [],
      requiredSlots: body.required_slots ?? [],
      retryPolicy: body.retry_policy ?? { maxAttempts: 2, retryAfterMinutes: 10 },
      callPolicy: body.call_policy ?? { maxDurationSeconds: 180, maxExtraQuestions: 2, tone: "warm_family_like" },
    };

    const template = createTaskTemplate(blueprint, body.caregiver_id ?? "user_001");
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
