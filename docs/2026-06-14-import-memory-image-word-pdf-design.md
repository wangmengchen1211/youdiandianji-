# 导入记忆支持 图片 / Word / PDF —— 设计文档

| 字段 | 值 |
|---|---|
| 文档日期 | 2026-06-14 |
| 适用范围 | 有点惦记项目（Next.js 16 + React 19） |
| 状态 | 草稿 v1，待用户 review |
| 关联记忆 | `导入记忆支持的文件类型`、`文档导入技术栈三要素决策` |

---

## 1. 背景与目标

### 1.1 现状（已探明）

- 前端 UI 已存在：`app/page.tsx` 第 4551-4577 行 `<input type="file" accept="image/*,.txt,.pdf">`
- 实际可工作的解析：
  - **TXT**：FileReader.readAsText 直读 ✓
  - **图片**：仅显示预览，文本框塞占位 `[待接入 PaddleOCR]`
  - **PDF**：FileReader 当文本读（**乱码不可用**）
  - **Word（.docx）**：accept 不包含，**完全无法上传**
- 后端：0 个 import/ocr endpoint
- 依赖：package.json 无任何 ocr/pdf/docx 库
- 记忆库 `导入记忆界面接入PaddleOCR` 已是既定决策，但**代码未落地**

### 1.2 目标

让"导入记忆"模态框真正支持以下三类文件：

1. **图片**（JPG/PNG/WebP）—— PaddleOCR 识别文字
2. **Word**（.docx）—— mammoth.js 抽取纯文本
3. **PDF**（含扫描件）—— pdf-parse 抽文本层；空文本层时回退 PaddleOCR

解析后的原文交给 DeepSeek LLM 按 17 个 MemoryCategory 自动抽结构化事实条目，前端让用户**勾选/编辑**后入库。

### 1.3 非目标（明确不做）

- 通话录音转写（属电话 Agent 范围）
- 家庭相册批量识别（保持单文件手动）
- 多语言 OCR（先中英文，lang='ch' 即可覆盖）
- OCR 服务鉴权（本地服务，localhost 可信）
- .doc（旧版 Word 二进制）—— 仅支持 .docx

---

## 2. 架构

```
[导入记忆模态框]
     ↓ FormData(multipart/form-data, file, elderId?)
[Next.js /api/import-memory]
     ↓ 文件类型路由
   ┌────┴─────────┬──────────┐
   ↓              ↓          ↓
mammoth.js     pdf-parse   PaddleOCR
(.docx)        (.pdf)      (图片 + 扫描PDF)
   │              │          │
   │   文本层为空时回退 OCR ──┘
   └──────┬───────┘
          ↓ 原文 (rawText)
   [DeepSeek LLM 抽取]
          ↓ JSON 候选条目
   [前端：分类卡片 + 勾选/编辑/删除]
          ↓ 用户点"导入 N 条"
   [memoryEntries 入条]
```

### 关键流程

1. 用户选文件 → 前端 FormData 上传
2. `/api/import-memory` 读取 multipart，按扩展名 + MIME 路由
3. 对每种文件类型调用对应解析器，统一拿到 `rawText`
4. 调用 LLM 抽取函数（用 zod schema 强制结构化输出）
5. 返回 `{ rawText, candidates, parser, durationMs }`
6. 前端按主分类（family_info/relationship/chat_style）分组展示
7. 用户确认后批量写入 `memoryEntries`

---

## 3. 目录结构（新增部分）

```
有点惦记/
├── app/api/import-memory/
│   └── route.ts                          # 主入口，类型路由
├── src/lib/import-parsers/
│   ├── mammoth-parser.ts                 # .docx → text
│   ├── pdf-parser.ts                     # .pdf 文本层 → text（扫描件回退 OCR）
│   ├── image-parser.ts                   # 图片 → PaddleOCR
│   └── llm-extract.ts                    # DeepSeek 抽取候选条目
├── ocr_service/                          # 独立 Python FastAPI 服务
│   ├── server.py
│   ├── requirements.txt
│   └── README.md
├── scripts/
│   ├── start-ocr.ps1                     # Windows 启动
│   └── start-ocr.sh                      # Mac/Linux 启动
├── docs/
│   └── 2026-06-14-import-memory-image-word-pdf-design.md   # 本文档
└── package.json                          # + scripts.ocr:start
```

---

## 4. API 契约

### 4.1 Next.js 路由

```
POST /api/import-memory
  Content-Type: multipart/form-data

  fields:
    file:    File  (必填，max 10MB)
    elderId: string (可选，用于后续按老人归档)

  returns 200:
    {
      rawText: string,                    // 原文（供用户参考/手动编辑）
      candidates: Array<{
        id: string,                       // 前端临时 id，nanoid
        category: MemoryCategory,         // 17 选 1
        content: string,                  // 抽取出的事实表述
        evidence: string,                 // 引用原文片段（<= 50 字）
        confidence: number                // 0-1
      }>,
      parser: 'mammoth' | 'pdf-text' | 'pdf-ocr' | 'image-ocr',
      durationMs: number
    }

  returns 4xx/5xx:
    { error: string, code: 'OCR_UNAVAILABLE' | 'FILE_TOO_LARGE' | 'PARSE_FAILED' | 'LLM_FAILED' }
```

### 4.2 PaddleOCR 服务

```
POST http://localhost:8765/ocr
  Content-Type: multipart/form-data
  body: file=<image_or_pdf_page>

  returns 200:
    { text: string, durationMs: number }

  returns 5xx:
    { error: string }
```

启动方式：`uvicorn server:app --port 8765 --host 127.0.0.1`

---

## 5. 关键模块设计

### 5.1 `mammoth-parser.ts`

```ts
// 用 mammoth 的 extractRawText 拿到纯文本（不转 HTML，最稳定）
import mammoth from "mammoth";

export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;  // 直接返回纯文本
}
```

### 5.2 `pdf-parser.ts`（双轨：文本层优先，扫描件回退 OCR）

```ts
import pdfParse from "pdf-parse";

export async function parsePdf(buffer: Buffer): Promise<{
  text: string;
  parser: 'pdf-text' | 'pdf-ocr';
}> {
  const data = await pdfParse(buffer);
  // 文本层：每页平均 < 50 字 视为扫描件
  const avgCharsPerPage = data.text.length / data.numpages;
  if (avgCharsPerPage >= 50) {
    return { text: data.text, parser: 'pdf-text' };
  }
  // 扫描件：把每页转图，调 PaddleOCR
  const ocrText = await ocrPdfPages(buffer);
  return { text: ocrText, parser: 'pdf-ocr' };
}
```

扫描件 OCR 流程（Node 端）：
1. `pdf2pic`（依赖系统 `graphicsmagick`）把 PDF 每页转 PNG（Buffer）
2. 逐页 POST 到 PaddleOCR `/ocr`
3. 拼接结果

> 实现细节：转图依赖 `graphicsmagick` 二进制（Windows 需手动安装或用 `pdf-to-png-converter` 纯 JS 降级方案）。**预研阶段需先验证 Windows 环境可用性**，否则降级为提示"扫描件 PDF 请先 OCR 再上传"。

> **依赖补充**：`pdf2pic` 和 `pdf-to-png-converter` 二选一加入 dependencies；优先 `pdf-to-png-converter`（纯 JS，无系统依赖，但只能处理简单 PDF）。

### 5.3 `image-parser.ts`

```ts
export async function parseImage(buffer: Buffer, mime: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), 'image');
  const res = await fetch('http://localhost:8765/ocr', { method: 'POST', body: form });
  if (!res.ok) throw new Error('OCR_FAILED');
  const { text } = await res.json();
  return text;
}
```

### 5.4 `llm-extract.ts`（DeepSeek 抽取）

**输入**：原文 + 老人名（可选）+ 当前记忆库已有条目（避免重复）

**输出**：zod schema 强约束的候选数组

**Prompt 要点**：
- 角色：亲情助理"念念"
- 任务：从原文中抽出 1-N 条**关于这位长辈的事实**
- 严格按 17 个 category 之一分类
- 每条给 evidence（引用原文 50 字内片段）
- 跳过"与长辈无关"、"明显广告/法律条款"、"无意义口水话"
- 已有记忆相似的不重复（用 cosine 简单判断或 prompt 提示）

**Schema**（zod）：
```ts
const CandidateSchema = z.object({
  category: z.enum([
    'about_user','about_elder','relationship','communication_style','pending_review',
    'elder_basic','elder_health','elder_habits','elder_contact',
    'rel_emotional','rel_history','rel_events','rel_preferences',
    'chat_language','chat_expression','chat_focus','chat_taboo'
  ]),
  content: z.string().min(2).max(200),
  evidence: z.string().max(100),
  confidence: z.number().min(0).max(1)
});
const ExtractResult = z.object({
  candidates: z.array(CandidateSchema)
});
```

调用 `generateStructured<typeof ExtractResult>(...)` 复用现有 `src/lib/llm/json-utils.ts`。

### 5.5 PaddleOCR 服务端

```python
# ocr_service/server.py
from fastapi import FastAPI, UploadFile, File
from paddleocr import PaddleOCR
import tempfile, os

app = FastAPI()
ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)

@app.post("/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "img")[1] or ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        result = ocr.ocr(tmp_path, cls=True)
        text = "\n".join(
            line[1][0] for page in result if page for line in page
        )
        return {"text": text, "durationMs": 0}
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
```

`requirements.txt`：
```
paddleocr>=2.7
paddlepaddle>=2.5
fastapi>=0.110
uvicorn>=0.27
python-multipart>=0.0.9
```

`scripts/start-ocr.ps1`（Windows）：
```powershell
# 1. 首次运行：创建 venv 并装依赖
if (-not (Test-Path "ocr_service/.venv")) {
  python -m venv ocr_service/.venv
  & ocr_service/.venv/Scripts/Activate.ps1
  pip install -r ocr_service/requirements.txt
} else {
  & ocr_service/.venv/Scripts/Activate.ps1
}
# 2. 启动服务
Set-Location ocr_service
uvicorn server:app --port 8765 --host 127.0.0.1
```

---

## 6. 前端 UX 流程

### 6.1 选文件阶段
- accept 改为 `image/*,.docx,.pdf,.txt`
- 提示文案：`JPG · PNG · WebP · DOCX · PDF · TXT`
- 选完立即显示文件名 + 解析进度条

### 6.2 解析阶段（4 个状态）

| 状态 | 文案 |
|---|---|
| `uploading` | 正在上传… |
| `parsing` | 正在解析 DOCX / 提取 PDF 文本 / OCR 识别中… |
| `extracting` | 念念正在帮你提炼关键信息… |
| `done` | 完成 |

超时阈值：30 秒（OCR 大文件可放宽到 60 秒，按 parser 分档）

### 6.3 结果展示（左右双栏）

```
┌─ 原文（只读，可滚动）─┬─ 候选条目（按主分类分组）─┐
│ 主诉：反复胸闷 2 月…  │ 家人信息 / 健康状况         │
│ 现病史：…             │ ☑ "妈妈有胸闷症状" [编][删]│
│                       │ 关系 / 情感纽带              │
│                       │ ☑ "妈妈担心孩子" [编][删]   │
└───────────────────────┴──────────────────────────┘
        [取消]              [导入 2 条记忆]
```

- 每条候选：可勾选（默认全选）/编辑内容/删除
- 主分类无候选项时折叠不显示
- 候选 0 条时显示"念念没找到可提炼的内容，可以手动从原文复制"

### 6.4 入库
- 用户点"导入 N 条" → 调 `/api/memory-entries` POST（**复用已有 endpoint**）
- 入条后弹 toast：`已导入 2 条到 家人信息 / 健康状况`
- 关闭模态框并刷新记忆库列表

---

## 7. 失败兜底

| 失败场景 | 行为 |
|---|---|
| OCR 服务未启动 | API 返回 503 `OCR_UNAVAILABLE` + 启动命令提示，前端展示原文让用户手动选段录入 |
| 文件 > 10MB | API 返回 413 `FILE_TOO_LARGE`，前端展示"文件过大，请压缩到 10MB 以内" |
| .docx 损坏 | API 返回 422 `PARSE_FAILED`，前端展示"文档解析失败：xxx" |
| PDF 扫描件 OCR 失败 | 回退到"提示用户先用其他工具 OCR 再上传"，或仅返回空 rawText + 0 候选 |
| LLM 抽取失败/超时 | 返回 rawText + candidates=[]，前端展示原文让用户手动录入 |
| LLM 输出格式错乱 | zod 解析失败时自动 retry 1 次，再失败返回空 candidates |

### 健康检查

前端在打开导入模态框时，先 `GET /api/import-memory/health`（返回 `{ ocrAvailable: boolean }`）。OCR 不可用时在上传区显示黄色提示条"OCR 服务未启动，部分功能受限 → 启动命令"。

---

## 8. 新增依赖

### 8.1 Node 端
```json
{
  "dependencies": {
    "mammoth": "^1.8.0",
    "pdf-parse": "^1.1.1",
    "pdf-to-png-converter": "^3.0.0"
  }
}
```

> `uid()` 复用项目已有的 `app/page.tsx:318` 函数，不引入 nanoid。

### 8.2 Python 端（`ocr_service/requirements.txt`）
```
paddleocr>=2.7
paddlepaddle>=2.5
fastapi>=0.110
uvicorn>=0.27
python-multipart>=0.0.9
```

### 8.3 package.json scripts
```json
{
  "scripts": {
    "ocr:start": "powershell -File scripts/start-ocr.ps1",
    "ocr:install": "python -m venv ocr_service/.venv && pip install -r ocr_service/requirements.txt"
  }
}
```

---

## 9. 验收标准

### 9.1 功能验收

- [ ] 上传 1MB JPG 病历图片 → 10 秒内出现候选条目
- [ ] 上传 500KB .docx 文档（带病历段落）→ 5 秒内出现候选
- [ ] 上传 2MB 文本型 PDF（可复制）→ 5 秒内出现候选
- [ ] 上传 5MB 扫描型 PDF（每页 < 50 字） → 30 秒内出现候选（OCR 回退）
- [ ] 候选条目按 17 个 category 正确分组
- [ ] 勾选 + 编辑 + 导入后，记忆库正确显示新条目
- [ ] 关闭 OCR 服务后上传图片：清晰错误提示，不卡死

### 9.2 代码质量

- [ ] `npx next build` 通过
- [ ] `app/api/import-memory/route.ts` 单元测试：mammoth 解析、pdf 文本层判断、LLM 抽取 retry
- [ ] PaddleOCR 服务可独立启停，README 含 Windows + Mac 启动命令

### 9.3 安全

- [ ] 文件大小硬限制 10MB（API 入口 + 前端 UI 双重校验）
- [ ] 文件 MIME 校验（拒绝非预期类型）
- [ ] 临时文件用后即删（`fs.unlink` 兜底）
- [ ] 不读取/修改任何 `.env`（用 OCR_SERVICE_URL 默认值即可）

---

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| PaddleOCR 首次启动下载模型慢（~50MB） | 中 | README 标注；启动脚本输出"模型已就绪"提示 |
| Windows 环境 graphicsmagick 缺失导致扫描 PDF 转图失败 | 中 | 检测二进制是否安装；缺失时降级提示"扫描件 PDF 暂不支持，请先用 OCR 工具处理" |
| pdf-parse 对加密 PDF 无效 | 低 | 提示用户先解密 |
| PaddleOCR 中文识别错字率（医疗术语） | 中 | LLM 抽取阶段提示"可纠错"；原文只读可手动复制修正 |
| 用户上传敏感病历 → 文本走 LLM API | 中 | 走 DeepSeek（已签 DPA 假设）；不存盘；文档明确"原始文件不上传到云" |

---

## 11. 实施步骤（高层概览）

1. 写 OCR Python 服务 + 启动脚本（独立可测）
2. 写 Node 端 mammoth/pdf-parse 解析器
3. 写 `/api/import-memory` 路由 + 类型分发
4. 写 LLM 抽取 prompt + zod schema
5. 改前端 upload 逻辑：accept + 进度 + 候选展示
6. 写 health check + 失败兜底
7. `npx next build` 验证
8. 端到端测试：3 种文件类型各跑一次

---

## 12. 范围外（重申）

- 通话录音批量转写
- 家庭相册自动识别
- 多语言 OCR（先中英文）
- OCR 服务鉴权/多用户
- .doc 旧版 Word 格式
- 文件分片上传（10MB 限制内单次即可）

