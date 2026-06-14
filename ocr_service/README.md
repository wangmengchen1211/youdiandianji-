# 有点惦记 OCR 服务

PaddleOCR 包装的 FastAPI 服务，提供 `/ocr` 和 `/health` 端点，监听 `127.0.0.1:8765`。

## 启动

### 首次运行

```powershell
# 项目根目录
npm run ocr:install      # 创建 venv + 装依赖（首次会下 paddlepaddle ~150MB + 模型 ~50MB）
npm run ocr:start        # 启动服务
```

### 已安装后

```powershell
npm run ocr:start
```

启动后输出 `Uvicorn running on http://127.0.0.1:8765` 即可。

## 端点

- `GET /health` → `{available: true, engine: "paddleocr", lang: "ch"}`
- `POST /ocr` → multipart `file` → `{text: string, lineCount: number}`

## 故障排查

### paddlepaddle 安装失败（Windows）

PaddlePaddle 官方 wheel 仅支持 Python 3.8-3.11。如果装 3.12+ 会失败。

确认 Python 版本：

```powershell
python --version
```

如需 3.11，可从 https://www.python.org/downloads/windows/ 下载 3.11.x，安装时勾 "Add to PATH"。

### 模型下载慢

PaddleOCR 首次会从 GitHub/国内 CDN 下载 ~50MB 检测+识别模型到 `~/.paddleocr/`，慢就耐心等。

### 端口被占

如有别的程序占 8765：

```powershell
netstat -ano | findstr 8765
taskkill /F /PID <pid>
```

或修改 `ocr_service/server.py` 末尾的 port。
