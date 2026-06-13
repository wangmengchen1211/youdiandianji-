import { NextResponse } from "next/server";
import { store } from "@/src/lib/store/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(store.snapshot());
}
