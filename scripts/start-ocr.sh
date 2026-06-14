#!/usr/bin/env bash
# 启动 PaddleOCR 服务 (macOS / Linux)
# 用法：在项目根目录执行 ./scripts/start-ocr.sh

set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PATH="$PROJECT_ROOT/ocr_service/.venv"
REQ_PATH="$PROJECT_ROOT/ocr_service/requirements.txt"
OCR_DIR="$PROJECT_ROOT/ocr_service"

# Detect python
PYTHON=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then
    PYTHON="$c"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "未找到 python3。请安装 Python 3.8-3.11。" >&2
  exit 1
fi

# Create venv on first run
if [ ! -d "$VENV_PATH" ]; then
  echo "首次运行：创建虚拟环境 $VENV_PATH ..."
  "$PYTHON" -m venv "$VENV_PATH"
  echo "安装依赖（首次会下载 paddlepaddle + 模型）..."
  "$VENV_PATH/bin/pip" install --upgrade pip
  "$VENV_PATH/bin/pip" install -r "$REQ_PATH"
fi

# Activate
# shellcheck disable=SC1091
source "$VENV_PATH/bin/activate"

# Start
cd "$OCR_DIR"
echo "启动 OCR 服务 @ http://127.0.0.1:8765 (Ctrl+C 退出)"
exec python -m uvicorn server:app --host 127.0.0.1 --port 8765
