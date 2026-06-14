# 启动 PaddleOCR 服务 (Windows PowerShell)
# 用法：在项目根目录执行 .\scripts\start-ocr.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPath = Join-Path $ProjectRoot "ocr_service\.venv"
$ReqPath = Join-Path $ProjectRoot "ocr_service\requirements.txt"
$OcrDir = Join-Path $ProjectRoot "ocr_service"

# Check Python
$python = $null
foreach ($c in @("python", "python3", "py")) {
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  if ($cmd) { $python = $c; break }
}
if (-not $python) {
  Write-Error "未找到 python。请安装 Python 3.8-3.11 并加入 PATH。"
  exit 1
}

# Create venv on first run
if (-not (Test-Path $VenvPath)) {
  Write-Host "首次运行：创建虚拟环境 $VenvPath ..."
  & $python -m venv $VenvPath
  Write-Host "安装依赖（首次会下载 paddlepaddle ~150MB + 模型 ~50MB，请耐心等待）..."
  & "$VenvPath\Scripts\python.exe" -m pip install --upgrade pip
  & "$VenvPath\Scripts\python.exe" -m pip install -r $ReqPath
}

# Activate venv
& "$VenvPath\Scripts\Activate.ps1"

# Start uvicorn
Set-Location $OcrDir
Write-Host "启动 OCR 服务 @ http://127.0.0.1:8765 (Ctrl+C 退出)"
python -m uvicorn server:app --host 127.0.0.1 --port 8765
