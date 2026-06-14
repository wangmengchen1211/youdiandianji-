import { NextResponse } from "next/server";
import { checkOcrAvailable } from "@/src/lib/import-parsers/ocr-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/import-memory/health
 * Probes whether the local PaddleOCR service is up.
 * Returns 200 always (caller decides what to do with ocrAvailable: false).
 */
export async function GET() {
  const ocrAvailable = await checkOcrAvailable();
  return NextResponse.json(
    {
      ocrAvailable,
      parsersAvailable: {
        mammoth: true,
        pdfParse: true,
      },
    },
    { status: 200 },
  );
}
