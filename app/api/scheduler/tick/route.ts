import { NextResponse } from "next/server";
import { schedulerTick } from "@/src/lib/services/scheduler-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const now = body.now as string | undefined;

    const result = await schedulerTick(now);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
