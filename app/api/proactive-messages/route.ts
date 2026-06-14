import { NextResponse } from "next/server";
import {
  getDueProactiveMessages,
  markMessageOpened,
  markMessageResponded,
  dismissMessage,
  snoozeMessage,
} from "@/src/lib/services/hook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/proactive-messages
 * Get pending/due proactive messages for a caregiver.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caregiverId = searchParams.get("caregiver_id");

    const messages = getDueProactiveMessages(new Date());
    const filtered = caregiverId
      ? messages.filter((m) => m.caregiverId === caregiverId)
      : messages;

    return NextResponse.json({
      messages: filtered.map((m) => ({
        id: m.id,
        familyId: m.familyId,
        elderId: m.elderId,
        caseId: m.caseId,
        channel: m.channel,
        content: m.content,
        status: m.status,
        createdAt: m.createdAt,
        sentAt: m.sentAt,
      })),
      total: filtered.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proactive-messages
 * Handle message actions: open, respond, dismiss, snooze.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message_id, action } = body;

    if (!message_id || !action) {
      return NextResponse.json(
        { error: "Missing required fields: message_id, action" },
        { status: 400 }
      );
    }

    switch (action) {
      case "open":
        markMessageOpened(message_id);
        break;
      case "respond":
        markMessageResponded(message_id);
        break;
      case "dismiss":
        dismissMessage(message_id);
        break;
      case "snooze": {
        const until = body.snooze_until
          ? new Date(body.snooze_until)
          : new Date(Date.now() + 60 * 60 * 1000); // default 1 hour
        snoozeMessage(message_id, until);
        break;
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, message_id, action });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
