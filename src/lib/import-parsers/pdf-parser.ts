// @ts-expect-error - pdf-parse v1.1.x ships no types
import pdfParse from "pdf-parse";
import { parsePdfOcr, PdfOcrUnavailableError } from "./pdf-ocr-parser";

/**
 * PDF parser with dual-track strategy:
 *   1. Try text-layer extraction via pdf-parse
 *   2. If avg chars/page < 50, treat as scanned PDF and fall back to OCR
 */
export class PdfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfParseError";
  }
}

export type PdfParseResult = {
  text: string;
  parser: "pdf-text" | "pdf-ocr";
};

const SCAN_THRESHOLD_CHARS_PER_PAGE = 50;

export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  let data: { text: string; numpages: number };
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    throw new PdfParseError(
      `PDF 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const pages = Math.max(1, data.numpages);
  const avg = data.text.length / pages;

  if (avg >= SCAN_THRESHOLD_CHARS_PER_PAGE) {
    return { text: data.text, parser: "pdf-text" };
  }

  // 扫描件：转图 OCR
  try {
    const ocrText = await parsePdfOcr(buffer);
    return { text: ocrText, parser: "pdf-ocr" };
  } catch (err) {
    if (err instanceof PdfOcrUnavailableError) {
      // OCR 不可用时，尝试返回 pdf-parse 的"空"文本 + parser 标记
      return { text: data.text || "", parser: "pdf-text" };
    }
    throw err;
  }
}
