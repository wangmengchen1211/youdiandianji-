/**
 * Detect whether OCR service (PaddleOCR FastAPI) is reachable.
 * Used by both Node-side health checks and front-end import modal.
 */
const OCR_BASE_URL = process.env.OCR_SERVICE_URL ?? "http://127.0.0.1:8765";
const HEALTH_TIMEOUT_MS = 3000;

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}

export async function checkOcrAvailable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${OCR_BASE_URL}/health`, {
      method: "GET",
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function getOcrBaseUrl(): string {
  return OCR_BASE_URL;
}
