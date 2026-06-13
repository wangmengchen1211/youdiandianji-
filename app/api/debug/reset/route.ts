import { NextResponse } from "next/server";
import { store } from "@/src/lib/store/memory-store";
import { seedDemoData } from "@/src/lib/store/seed-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  store.reset(seedDemoData());
  return NextResponse.json({ success: true, message: "Store has been reset to demo data." });
}
