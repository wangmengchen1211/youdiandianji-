import { getOcrBaseUrl, OcrUnavailableError } from "./ocr-client";

/**
 * Call PaddleOCR /ocr on a single image buffer.
 * Returns extracted plain text (one line per detected row).
 */
export async function parseImage(
  buffer: Buffer,
  mime: string,
  filename?: string,
): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mime });
  form.append("file", blob, filename ?? "image");

  let res: Response;
  try {
    res = await fetch(`${getOcrBaseUrl()}/ocr`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    throw new OcrUnavailableError(
      `OCR 服务连接失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    if (res.status === 500) {
      throw new OcrUnavailableError("OCR 识别失败（服务端错误）");
    }
    throw new OcrUnavailableError(`OCR 服务返回 ${res.status}`);
  }

  const data = (await res.json()) as { text?: string; lineCount?: number };
  return data.text ?? "";
}
