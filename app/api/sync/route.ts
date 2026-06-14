import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── 跨设备状态同步：基于 globalThis 内存存储 ──────────────────────────
// Vercel warm 实例内有效；冷启动会重置（demo 可接受）。
// 生产环境建议替换为 Vercel KV / Redis。

type SyncEntry = {
  state: unknown;
  timestamp: number;
  updatedAt: string;
};

const globalForSync = globalThis as unknown as {
  __dianjiSyncMap?: Map<string, SyncEntry>;
};

if (!globalForSync.__dianjiSyncMap) {
  globalForSync.__dianjiSyncMap = new Map();
}
const syncMap = globalForSync.__dianjiSyncMap;

// GET /api/sync?userId=xxx → 返回该用户最新的状态快照
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  const entry = syncMap.get(userId);
  if (!entry) {
    return NextResponse.json({ state: null, timestamp: 0 });
  }
  return NextResponse.json({
    state: entry.state,
    timestamp: entry.timestamp,
    updatedAt: entry.updatedAt,
  });
}

// POST /api/sync { userId, state } → 存储该用户的状态快照
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, state } = body as { userId: string; state: unknown };
    if (!userId || !state) {
      return NextResponse.json({ error: "missing userId or state" }, { status: 400 });
    }

    const now = Date.now();
    const entry: SyncEntry = {
      state,
      timestamp: now,
      updatedAt: new Date(now).toISOString(),
    };
    syncMap.set(userId, entry);

    return NextResponse.json({ ok: true, timestamp: now });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
}
