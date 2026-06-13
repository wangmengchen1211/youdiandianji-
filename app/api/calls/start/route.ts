import { NextResponse } from "next/server";
import { startCall } from "@/src/lib/services/call-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task_occurrence_id } = body;

    if (!task_occurrence_id) {
      return NextResponse.json({ error: "Missing 'task_occurrence_id'." }, { status: 400 });
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
