import { NextResponse } from "next/server";
import { getCareInsights } from "@/src/lib/services/care-insight-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const caregiverId = searchParams.get("caregiver_id") ?? undefined;

  const insights = getCareInsights(caregiverId);
  return NextResponse.json(insights);
}
