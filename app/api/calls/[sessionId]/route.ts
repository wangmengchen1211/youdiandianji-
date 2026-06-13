import { NextResponse } from "next/server";
import { getCallSession } from "@/src/lib/services/call-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = getCallSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Call session not found." }, { status: 404 });
  }

  return NextResponse.json(session);
}
