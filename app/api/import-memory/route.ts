import { NextResponse } from "next/server";
import { parseDocx, DocxParseError } from "@/src/lib/import-parsers/mammoth-parser";
import { parsePdf, PdfParseError } from "@/src/lib/import-parsers/pdf-parser";
import { parseImage } from "@/src/lib/import-parsers/image-parser";
import { extractCandidates } from "@/src/lib/import-parsers/llm-extract";
import { OcrUnavailableError } from "@/src/lib/import-parsers/ocr-client";
import {
  type Candidate,
  type MemoryCategoryValue,
} from "@/src/lib/import-parsers/schemas/extract-result.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];
const DOC_EXTS = ["docx"];
const PDF_EXTS = ["pdf"];
const TXT_EXTS = ["txt"];

type ParserKind = "mammoth" | "pdf-text" | "pdf-ocr" | "image-ocr" | "txt";

type ResponseBody = {
  rawText: string;
  candidates: Array<Candidate & { id: string }>;
  parser: ParserKind;
  durationMs: number;
  fileMeta: {
    name: string;
    size: number;
    mime: string;
  };
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function detectKind(filename: string, mime: string): ParserKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (IMAGE_EXTS.includes(ext) || mime.startsWith("image/")) return "image-ocr";
  if (DOC_EXTS.includes(ext)) return "mammoth";
  if (PDF_EXTS.includes(ext)) return "pdf-text"; // actual parser determined later
  if (TXT_EXTS.includes(ext)) return "txt";
  return null;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(request: Request) {
  const start = Date.now();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("BAD_REQUEST", "请求体不是合法的 multipart/form-data", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("BAD_REQUEST", "缺少 file 字段", 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError(
      "FILE_TOO_LARGE",
      `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请压缩到 10MB 以内`,
      413,
    );
  }

  if (file.size === 0) {
    return jsonError("BAD_REQUEST", "文件为空", 400);
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return jsonError(
      "UNSUPPORTED_TYPE",
      `不支持的文件类型: .${file.name.split(".").pop() ?? "?"}（仅支持 JPG/PNG/WebP/DOCX/PDF/TXT）`,
      415,
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // elderId 字段：用于在抽取时传给 LLM 提示
  const elderId = formData.get("elderId");
  const elderName = formData.get("elderName");
  const elderNameStr = typeof elderName === "string" && elderName.trim() ? elderName.trim() : undefined;
  void elderId; // currently unused, kept for future "check existing memories" feature

  let rawText = "";
  let parser: ParserKind = kind;

  try {
    if (kind === "image-ocr") {
      rawText = await parseImage(buffer, file.type || "image/png", file.name);
    } else if (kind === "mammoth") {
      rawText = await parseDocx(buffer);
    } else if (kind === "pdf-text" || kind === "pdf-ocr") {
      const result = await parsePdf(buffer);
      rawText = result.text;
      parser = result.parser;
    } else if (kind === "txt") {
      rawText = buffer.toString("utf-8");
      if (!rawText.trim()) {
        return jsonError("PARSE_FAILED", "TXT 文件为空", 422);
      }
    }
  } catch (err) {
    if (err instanceof OcrUnavailableError) {
      return jsonError("OCR_UNAVAILABLE", err.message, 503);
    }
    if (err instanceof DocxParseError) {
      return jsonError("PARSE_FAILED", err.message, 422);
    }
    if (err instanceof PdfParseError) {
      return jsonError("PARSE_FAILED", err.message, 422);
    }
    return jsonError(
      "PARSE_FAILED",
      `解析失败: ${err instanceof Error ? err.message : String(err)}`,
      422,
    );
  }

  // LLM 抽取（失败不阻塞：返回空 candidates 让用户从原文手录）
  let candidates: Array<Candidate & { id: string }> = [];
  if (rawText.trim()) {
    const result = await extractCandidates(rawText, { elderName: elderNameStr });
    candidates = result.candidates.map((c) => ({
      ...c,
      id: uid("cand"),
      // 强制类型断言：zod 已验证 category 必为 17 选 1
    })) as Array<Candidate & { id: string } & { category: MemoryCategoryValue }>;
  }

  const body: ResponseBody = {
    rawText,
    candidates,
    parser,
    durationMs: Date.now() - start,
    fileMeta: {
      name: file.name,
      size: file.size,
      mime: file.type,
    },
  };

  return NextResponse.json(body, { status: 200 });
}
