import { NextResponse } from "next/server";
import { startCall } from "@/src/lib/services/call-orchestrator";
import { isV2Enabled, shouldFallbackToV1 } from "@/src/lib/workflows/feature-flag";
import { startCall as v2StartCall } from "@/src/lib/workflows/call.workflow";
import { store } from "@/src/lib/store/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task_occurrence_id } = body;

    if (!task_occurrence_id) {
      return NextResponse.json({ error: "Missing 'task_occurrence_id'." }, { status: 400 });
    }

    // --- v2 Workflow 分支 ---
    if (isV2Enabled("call")) {
      try {
        // 从 store 获取 task occurrence + template 信息
        const occ = store.getTaskOccurrence(task_occurrence_id);
        const template = occ ? store.getTaskTemplate(occ.taskTemplateId) : null;

        const v2Result = await v2StartCall({
          taskOccurrenceId: task_occurrence_id,
          familyId: template?.familyId ?? "",
          elderId: template?.elderId ?? "",
          caregiverId: template?.caregiverId ?? "user_001",
          phone: "",
          provider: "mock",
          taskTemplate: template as unknown as Record<string, unknown> ?? {},
        });

        return NextResponse.json({
          call_session_id: v2Result.data?.sessionId,
          status: "connected",
          initial_reply: v2Result.content,
          stage: "identity_and_consent",
          meta: { v2: true },
        });
      } catch (v2Error) {
        if (shouldFallbackToV1(v2Error, "call")) {
          // fall through to v1 below
        } else {
          throw v2Error;
        }
      }
    }

    const { callSession, initialReply } = await startCall(task_occurrence_id);

    return NextResponse.json({
      call_session_id: callSession.id,
      status: callSession.status,
      initial_reply: initialReply,
      stage: callSession.conversationState.stage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
