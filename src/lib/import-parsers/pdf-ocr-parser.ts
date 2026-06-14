import { pdfToPng, type PngPageOutput } from "pdf-to-png-converter";
import { getOcrBaseUrl, OcrUnavailableError } from "./ocr-client";

/**
 * Convert each page of a PDF to PNG, run OCR on each, concatenate results.
 * Falls back gracefully — if any page fails, that page's text is omitted
 * but other pages are still returned.
 */
export class PdfOcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfOcrUnavailableError";
  }
}

async function pdfPagesToPngs(buffer: Buffer): Promise<Buffer[]> {
  // pdfToPng accepts ArrayBufferLike / Uint8Array. pdf-parse v1.1+ and Node fetch
  // both produce ArrayBuffer on Node 18+.
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const pages: PngPageOutput[] = await pdfToPng(ab, {
    disableFontFace: true,
    useSystemFonts: true,
    viewportScale: 2.0,
    returnPageContent: true,
  });
  return pages
    .map((p) => p.content)
    .filter((c): c is Buffer => c instanceof Buffer && c.length > 0);
}

async function ocrOnePage(png: Buffer, pageNumber: number): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    `page-${pageNumber}.png`,
  );
  const res = await fetch(`${getOcrBaseUrl()}/ocr`, { method: "POST", body: form });
  if (!res.ok) {
    throw new OcrUnavailableError(`OCR 第 ${pageNumber} 页失败 (${res.status})`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export async function parsePdfOcr(buffer: Buffer): Promise<string> {
  let pngs: Buffer[];
  try {
    pngs = await pdfPagesToPngs(buffer);
  } catch (err) {
    throw new PdfOcrUnavailableError(
      `PDF 转图失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (pngs.length === 0) {
    return "";
  }

  const pageTexts: string[] = [];
  for (let i = 0; i < pngs.length; i++) {
    try {
      const text = await ocrOnePage(pngs[i], i + 1);
      if (text.trim()) pageTexts.push(text);
    } catch {
      // Skip failed pages, keep going
    }
  }

  if (pageTexts.length === 0) {
    throw new PdfOcrUnavailableError("扫描件 PDF OCR 全部失败");
  }

  return pageTexts.join("\n\n");
}
