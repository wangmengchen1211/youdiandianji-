import { NextResponse } from "next/server";
import { traceStore } from "@/src/lib/llm/trace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const traces = traceStore.getRecent(100);
  const stats = traceStore.getStats();
  return NextResponse.json({ traces, stats });
}
