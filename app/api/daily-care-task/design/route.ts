import { NextResponse } from "next/server";
import { designTask } from "@/src/lib/agents/task-designer";
import { store } from "@/src/lib/store/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user_id, text, current_elder_id } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const elders = store.getElders().map((e) => ({
      elderId: e.id,
      displayName: e.displayName,
      nicknames: e.nicknames,
    }));

    const result = await designTask({
      userId: user_id ?? "user_001",
      text,
      currentElderId: current_elder_id ?? null,
      knownElders: elders,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
