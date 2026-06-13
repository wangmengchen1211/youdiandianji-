import { NextRequest, NextResponse } from "next/server";

interface ElderProfileRecord {
  id: string; familyId: string; template: unknown;
  elderId: string; caregiverId: string;
  status: "draft" | "active" | "archived";
  createdAt: string; updatedAt: string;
}

const profileStore: ElderProfileRecord[] = [];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const familyId = searchParams.get("familyId") || "family_001";
  const status = searchParams.get("status");
  let results = profileStore.filter((p) => p.familyId === familyId);
  if (status) results = results.filter((p) => p.status === status);
  return NextResponse.json({ success: true, data: results, total: results.length });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template, familyId, caregiverId } = body;
    if (!template || !template.basicInfo) {
      return NextResponse.json({ success: false, error: "missing template data" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const record: ElderProfileRecord = {
      id: `profile_${Date.now()}`, familyId: familyId || "family_001",
      template, elderId: `elder_${Date.now()}`, caregiverId: caregiverId || "user_001",
      status: "active", createdAt: now, updatedAt: now,
    };
    profileStore.push(record);
    return NextResponse.json({ success: true, data: { profileId: record.id, elderId: record.elderId, displayName: template.basicInfo.displayName } });
  } catch {
    return NextResponse.json({ success: false, error: "failed to create elder profile" }, { status: 500 });
  }
}