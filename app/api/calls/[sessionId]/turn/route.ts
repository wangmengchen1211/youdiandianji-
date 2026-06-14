import { NextResponse } from "next/server";
import { processTurn } from "@/src/lib/services/call-orchestrator";
import { isV2Enabled, shouldFallbackToV1 } from "@/src/lib/workflows/feature-flag";
import { processTurn as v2ProcessTurn } from "@/src/lib/workflows/call.workflow";
import * as callSessionService from "@/src/lib/services/call-session.service";

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

    // --- v2 Workflow 分支 ---
    if (isV2Enabled("call")) {
      try {
        const session = callSessionService.load(sessionId);
        const v2Result = await v2ProcessTurn({
          sessionId,
          elderUtterance: elder_input,
          elderId: session?.elderId ?? "",
          caregiverId: session?.caregiverId ?? "",
        });

        return NextResponse.json({
          assistant_reply: v2Result.content,
          stage: (v2Result.data?.analysis as any)?.next_stage ?? null,
          task_slots: (v2Result.data?.analysis as any)?.task_slots ?? {},
          is_call_ending: Boolean(v2Result.data?.isCallEnding),
          probe_budget: null,
          emotion: null,
          relationship_signals: [],
          state_patch: {},
          safety: { safe: true, repaired: false },
          observations: v2Result.observations ?? [],
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

    const result = await processTurn(sessionId, elder_input);

    return NextResponse.json({
      assistant_reply: result.assistantReply,
      stage: result.stage,
      task_slots: result.taskSlots,
      is_call_ending: result.isCallEnding,
      // Enhanced fields from TurnPlanner
      probe_budget: result.probeBudget ?? null,
      emotion: result.emotion ?? null,
      relationship_signals: result.relationshipSignals ?? [],
      state_patch: result.statePatch ?? {},
      safety: result.safety ?? { safe: true, repaired: false },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
