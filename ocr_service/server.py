"""PaddleOCR FastAPI service for 有点惦记.

Provides /ocr and /health endpoints on 127.0.0.1:8765.
Designed to be started via scripts/start-ocr.ps1 or scripts/start-ocr.sh.
"""
from __future__ import annotations

import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR

app = FastAPI(title="有点惦记 OCR", version="1.0.0")

# Initialize once at startup. PaddleOCR downloads its model on first use
# (~50MB) so this can be slow the first time.
ocr_engine = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)


@app.get("/health")
async def health() -> dict:
    """Liveness probe used by Next.js /api/import-memory/health."""
    return {
        "available": True,
        "engine": "paddleocr",
        "lang": "ch",
    }


@app.post("/ocr")
async def ocr_endpoint(file: UploadFile = File(...)) -> dict:
    """Run OCR on a single image and return extracted text.

    The caller is expected to be a trusted local Next.js process
    (127.0.0.1), so no authentication is enforced.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")

    suffix = os.path.splitext(file.filename)[1] or ".png"
    # tempfile on Windows requires delete=False so we can pass the path to PaddleOCR
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="empty file")
        tmp.write(contents)
        tmp.flush()
        tmp_path = tmp.name
    finally:
        tmp.close()

    try:
        result = ocr_engine.ocr(tmp_path, cls=True)
        # result is list[list[line]] for multi-page; for single image it's
        # list[line] where each line is [[x1,y1,...], (text, conf)]
        lines: list[str] = []
        for page in result or []:
            for line in page or []:
                try:
                    text = line[1][0]
                except (IndexError, TypeError):
                    continue
                if text:
                    lines.append(text)
        return {"text": "\n".join(lines), "lineCount": len(lines)}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface as 500 to caller
        raise HTTPException(status_code=500, detail=f"OCR_FAILED: {exc}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
