import { NextResponse } from "next/server";
import { finalizeCall } from "@/src/lib/services/call-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const result = await finalizeCall(sessionId);

    return NextResponse.json({
      summary: result.summary,
      memories_extracted: result.memoriesExtracted,
      care_insight_id: result.careInsightId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
