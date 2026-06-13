import { NextResponse } from "next/server";
import { processTurn } from "@/src/lib/services/call-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { speaker, elder_input } = body;

    if (speaker !== "elder" || !elder_input) {
      return NextResponse.json(
        { error: "Expected { speaker: 'elder', elder_input: '...' }" },
        { status: 400 }
      );
    }

    const result = await processTurn(sessionId, elder_input);

    return NextResponse.json({
      assistant_reply: result.assistantReply,
      stage: result.stage,
      task_slots: result.taskSlots,
      is_call_ending: result.isCallEnding,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
