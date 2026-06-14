import { NextResponse } from "next/server";
import { finalizeCall } from "@/src/lib/services/call-orchestrator";
import { processHookEvent } from "@/src/lib/services/hook-service";
import { store } from "@/src/lib/store/memory-store";
import type { HookEvent } from "@/src/lib/store/types";
import { isV2Enabled, shouldFallbackToV1 } from "@/src/lib/workflows/feature-flag";
import { handle as postCallWorkflowHandle } from "@/src/lib/workflows/post-call.workflow";
import * as callSessionService from "@/src/lib/services/call-session.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // --- v2 Workflow 分支 ---
    if (isV2Enabled("call")) {
      try {
        const session = callSessionService.load(sessionId);
        const v2Result = await postCallWorkflowHandle({
          sessionId,
          elderId: session?.elderId ?? "",
          caregiverId: session?.caregiverId ?? "",
        });

        return NextResponse.json({
          summary: (v2Result.data?.task_result as any)?.status ?? v2Result.content,
          memories_extracted: (v2Result.data?.memory_count as number) ?? 0,
          care_insight_id: (v2Result.data?.care_insight as any)?.id ?? null,
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

    const result = await finalizeCall(sessionId);

    // Generate HookEvents after call finalization
    const session = store.getCallSession(sessionId);
    if (session) {
      const hookEvents: HookEvent[] = [];

      // 1. task_completed hook
      hookEvents.push({
        id: store.genId("hook_evt"),
        familyId: session.familyId,
        eventType: "task_completed",
        sourceType: "call_session",
        sourceId: sessionId,
        payload: {
          elderId: session.elderId,
          caregiverId: session.caregiverId,
          taskOccurrenceId: session.taskOccurrenceId,
          summary: result.summary.slice(0, 200),
        },
        createdAt: new Date().toISOString(),
      });

      // 2. elder_relay_message hook (if elder had a message for child)
      const messageToChild = session.conversationState.relationshipSlots?.message_to_child;
      if (messageToChild && typeof messageToChild === "string" && messageToChild.trim()) {
        hookEvents.push({
          id: store.genId("hook_evt"),
          familyId: session.familyId,
          eventType: "elder_relay_message",
          sourceType: "call_session",
          sourceId: sessionId,
          payload: {
            elderId: session.elderId,
            caregiverId: session.caregiverId,
            message: messageToChild,
          },
          createdAt: new Date().toISOString(),
        });
      }

      // Process all hook events (idempotent, scoring, message generation)
      for (const evt of hookEvents) {
        await processHookEvent(evt).catch(() => {
          // Non-critical: don't fail finalize if hook processing fails
        });
      }
    }

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
