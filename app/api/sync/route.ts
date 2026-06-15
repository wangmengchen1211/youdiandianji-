import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── 跨设备状态同步：基于 /tmp 文件持久化 ────────────────────────────
// 优势：Vercel serverless 同实例内多次请求可共享状态（冷启动仍会清空）。
// 局限：/tmp 不跨 serverless 实例，多实例下仍可能丢失；生产环境建议替换为 Vercel KV / Redis。
// 兜底：/tmp 不可写时降级到进程内存（仅单实例有效）。

type SyncEntry = {
  state: unknown;
  timestamp: number;
  updatedAt: string;
};

const SYNC_DIR = "/tmp";
const SYNC_FILE = path.join(SYNC_DIR, "yddj-sync.json");

// 进程内存兜底（当 /tmp 不可写时使用）
let memFallback: Record<string, SyncEntry> = {};

async function readAll(): Promise<Record<string, SyncEntry>> {
  try {
    const raw = await fs.readFile(SYNC_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeAll(map: Record<string, SyncEntry>): Promise<void> {
  try {
    await fs.mkdir(SYNC_DIR, { recursive: true });
    await fs.writeFile(SYNC_FILE, JSON.stringify(map));
  } catch (err) {
    // /tmp 不可写时降级到内存（仅单实例有效）
    console.warn("[sync] persist to /tmp failed, falling back to in-memory:", err);
    memFallback = map;
  }
}

// GET /api/sync?userId=xxx → 返回该用户最新的状态快照
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  let all = await readAll();
  if (Object.keys(all).length === 0) all = memFallback;
  const entry = all[userId];
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

    let all = await readAll();
    if (Object.keys(all).length === 0) all = memFallback;
    all[userId] = entry;
    await writeAll(all);

    return NextResponse.json({ ok: true, timestamp: now });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
}
