# 突然有点惦记你们

> **不是提醒老人，而是让惦记有回声。**

面向「家属 - 长辈」远程照护场景的 **双端 AI Agent 产品**。家属只需一句话，就能为长辈创建提醒任务，由 AI 通过电话或消息温柔触达，并追踪长辈是否收到、是否确认、是否完成。

让远方的惦记不再停在"我发了"，而是变成"TA 回了，我放心了"。

---

## 核心功能

### 子女端（Child Side）
- **自然语言创建任务** — "每天晚上8点提醒妈妈测血糖" → 自动解析为结构化提醒任务
- **小纸条改写** — 将生硬的文字改写为温暖、不责备的亲情表达
- **深度关怀对话** — 当家属说出担忧（如"妈妈好像有点老年痴呆"），AI 主动追问、不诊断、不机械共情
- **记忆库管理** — 支持导入 Word/PDF/图片（OCR），自动提取记忆候选并归类
- **通话记录与洞察** — 每次通话后自动生成事实摘要、关系洞察、建议消息

### 长辈端（Elder Side）
- **AI 语音电话** — 自动拨打长辈电话，以亲昵口吻进行多轮对话
- **状态机驱动** — greeting → warm_chat → task_reminder → relay → closing，智能推进
- **身份透明** — 开场必须说"我是XX设置的小助理念念"，绝不冒充家属
- **留言转达** — 长辈说"跟小雨说我没事"，自动记录并转达给子女
- **安全兜底** — 称谓后校验 + 安全内容检查，禁止"您/喂/小宝贝"等不当用语

### 主动关怀（Proactive Care）
- **Hook 消息引擎** — 基于事件驱动（通话结束、任务完成等）触发主动关怀
- **7 维评分** — 去重 → 冷却 → 每日限额 → 静默时间 → 加权评分 → LLM 文案 → 安全检查
- **事件溯源** — 每条主动消息必须有 `trigger_event` + `why_now` + `message_goal`

---

## 技术架构（v2）

项目采用 **Workflow + Cognitive Skills + Domain Services + Safety + Event Bus** 三层架构：

```
┌──────────────────────────────────────────────────────────────┐
│                     API 层 (Next.js Route Handlers)            │
│  [Feature Flag: isV2Enabled("chat"|"call"|"hook")]            │
│  [v2 workflow → Response Adapter → 旧前端 AgentResponse]      │
└──────────┬──────────────┬────────────────┬───────────────────┘
           │              │                │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
    │ chat.       │ │ call.      │ │ hook.       │
    │ workflow    │ │ workflow   │ │ workflow    │
    └──────┬──────┘ └─────┬──────┘ └──────┬──────┘
           └───────────────┼───────────────┘
    ┌──────────────────────▼──────────────────────────┐
    │         Cognitive Skills (8 个)                   │
    │  只做理解/生成/提取，不直接写 Store              │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │       LLM Provider (统一 DeepSeek 调用)           │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │  Domain Services + SafetyService(三层) + EventBus │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │              Store 层 (Memory Store)              │
    └─────────────────────────────────────────────────┘
```

### 三层安全机制

```
preCheck(input) → 规则层初筛（关键词匹配安全策略）
  ↓
mergePolicy(preCheck, classifier) → 取并集
  ↓
policyConstraint(policy) → 生成 prompt 注入约束数组
  ↓
[LLM 生成回复，约束已注入到 prompt]
  ↓
postCheck(output) → allow / sanitize / block
```

### v2.1 通话链路重构（三步编排）

v2.1 解决了状态机管太多的问题，核心理念：**LLM 提议，状态机校验**（而非状态机拍板，LLM 填空）。

```
长辈输入
  ↓
Step 1: UnderstandTurn（意图识别）
  · 规则层预筛（否定词/情绪词检测）
  · LLM 语义理解 → 9 种意图分类
  · 修复：“方便”≠“不方便”（先检测否定词再判断）
  ↓
Step 2: DecideNextAction（LLM 提议 + 状态机校验）
  · LLM 提议下一阶段 + 动作
  · 状态机只做安全校验（硬上限/拒绝/身份锁定）
  · 修复：listen_and_reflect 最多 1 轮（不再粘滞）
  ↓
Step 3: GenerateReply（自然话术生成）
  · 禁止机械模板（“我记住了，我在听”）
  · 先回应内容，再自然过渡
  · 高温度（0.7）保证话术多样性
```

**完整日志系统**：每轮记录 9 字段（rawASR / normalizedText / stageBefore / intent / confidence / evidence / stageAfter / replySource / endReason），便于调试定位。

### v1 → v2 模块映射

| v1 模块 | v2 替代 |
|---------|---------|
| agent-router + situation-recognizer | `cognitive/intent-situation-classifier` |
| depth-planner + probe-generator + case-formulation | `cognitive/deep-care-dialogue-engine` |
| task-designer | `cognitive/task-blueprint-extractor` |
| call-plan-generator | `cognitive/call-plan-builder` |
| turn-planner | `cognitive/call-turn-engine` |
| response-understanding | `cognitive/post-call-extractor` |
| memory-curator + care-insight-writer | `cognitive/memory-insight-writer` |
| hook-candidate-generator + hook-message-realizer | `workflows/hook.workflow` + `cognitive/hook-message-planner` |
| family/relationship-context-composer | `services/context.service` |
| safety-guard | `services/safety.service`（三层） |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router) + React 19 |
| 语言 | TypeScript 5.9 |
| 样式 | Tailwind CSS 4 |
| LLM | DeepSeek Chat API |
| 结构化输出 | Zod 4 (Schema Validation) |
| TTS 语音合成 | MiniMax / 火山引擎 / Azure / edge-tts / 浏览器原生（五级降级） |
| OCR | PaddleOCR（本地 Python 服务） |
| 文档解析 | mammoth (Word) / pdf-parse (PDF) / sharp (图片) |
| 部署 | Vercel |
| 数据存储 | 内存 Store（MVP，可替换为 DB） |

---

## 目录结构

```
.
├── app/                          # Next.js App Router
│   ├── page.tsx                  # 主页面（子女端 + 长辈端双模式切换）
│   ├── layout.tsx                # 根布局
│   ├── globals.css               # 全局样式
│   ├── components/               # UI 组件
│   │   ├── VoiceCallModal.tsx    # 语音通话弹窗
│   │   └── hooks/                # React Hooks
│   │       ├── useSpeechRecognition.ts
│   │       └── useSpeechSynthesis.ts
│   └── api/                      # API Routes
│       ├── agent/                # 子女端聊天主入口
│       ├── companion/chat/       # 深度关怀对话
│       ├── calls/                # 通话链路
│       │   ├── start/            # 发起通话
│       │   └── [sessionId]/
│       │       ├── turn/         # 通话轮次
│       │       └── finalize/     # 通话后分析
│       ├── elder-call-conversation/  # 长辈端通话（状态机）
│       ├── elder-chat/           # 长辈端文字聊天
│       ├── tts/                  # 语音合成
│       ├── import-memory/        # 记忆导入
│       ├── proactive-messages/   # 主动消息
│       ├── scheduler/tick/       # 定时调度
│       └── ...
├── src/
│   ├── components/               # 共享组件
│   │   └── ElderProfileForm.tsx  # 长辈档案表单
│   └── lib/
│       ├── agents/               # v1 Agent 模块（已标记 @deprecated）
│       │   ├── agent-router.ts
│       │   ├── depth-planner.ts
│       │   ├── turn-planner.ts
│       │   ├── safety-guard.ts   # 保留：纯规则安全检查
│       │   ├── prompts/          # v1 Prompt 模板
│       │   ├── schemas/          # v1 Zod Schema
│       │   └── evals/            # 评测用例
│       ├── cognitive/            # v2 认知技能（8+3=11 个）
│       │   ├── intent-situation-classifier.ts
│       │   ├── deep-care-dialogue-engine.ts
│       │   ├── task-blueprint-extractor.ts
│       │   ├── call-plan-builder.ts
│       │   ├── call-turn-engine.ts
│       │   ├── turn-intent-classifier.ts   # v2.1 意图识别
│       │   ├── action-decider.ts           # v2.1 LLM提议+状态机校验
│       │   ├── reply-generator.ts          # v2.1 自然话术生成
│       │   ├── post-call-extractor.ts
│       │   ├── memory-insight-writer.ts
│       │   └── hook-message-planner.ts
│       ├── prompts/              # v2 Prompt 模板（12 个，含 v2.1）
│       │   ├── turn-intent-classifier.prompt.ts  # v2.1
│       │   ├── action-proposal.prompt.ts         # v2.1
│       │   ├── generate-reply.prompt.ts          # v2.1
│       │   └── ...
│       ├── schemas/              # v2 Zod Schema（9 个，含 v2.1）
│       │   ├── turn-intent.schema.ts             # v2.1
│       │   ├── action-decision.schema.ts         # v2.1
│       │   └── ...
│       ├── workflows/            # v2 工作流编排
│       │   ├── chat.workflow.ts      # 子女端主入口
│       │   ├── call.workflow.ts      # 通话链路（v2/v2.1 双模式）
│       │   ├── turn-orchestrator.ts  # v2.1 三步编排总入口
│       │   ├── post-call.workflow.ts # 通话后分析（幂等）
│       │   ├── hook.workflow.ts      # 主动关怀
│       │   ├── scheduler.workflow.ts # 调度器
│       │   ├── feature-flag.ts       # 灰度开关（v2 + v2.1）
│       │   ├── response-adapter.ts   # v2→旧前端适配
│       │   └── regression-cases.ts   # 回归测试样例
│       ├── services/             # 领域服务
│       │   ├── context.service.ts    # 上下文组装
│       │   ├── safety.service.ts     # 三层安全
│       │   ├── event-bus.service.ts  # 事件总线
│       │   ├── call-session.service.ts # 通话会话管理（含身份锁定）
│       │   ├── turn-logger.service.ts   # v2.1 完整日志（9字段）
│       │   ├── llm.service.ts        # LLM 统一调用
│       │   ├── call-orchestrator.ts  # v1 通话编排
│       │   ├── hook-service.ts       # Hook 领域能力
│       │   └── ...
│       ├── llm/                  # LLM 调用基础设施
│       │   ├── llm-provider.ts
│       │   ├── json-utils.ts
│       │   └── trace-store.ts
│       ├── store/                # 数据存储层
│       │   ├── types.ts          # 核心领域类型
│       │   ├── memory-store.ts   # 内存 Store 实现
│       │   ├── seed-data.ts      # 种子数据
│       │   └── seed-data-mama.ts # 妈妈专属 mock
│       ├── import-parsers/       # 文档导入解析
│       │   ├── image-parser.ts
│       │   ├── mammoth-parser.ts
│       │   ├── pdf-parser.ts
│       │   ├── pdf-ocr-parser.ts
│       │   ├── ocr-client.ts
│       │   └── llm-extract.ts
│       ├── telephony/            # 电话服务接口
│       └── templates/            # 模板数据
├── ocr_service/                  # OCR 本地服务（Python）
│   ├── server.py
│   └── requirements.txt
├── docs/                         # 项目文档
│   ├── agent-architecture.md     # Agent 架构全景文档（v2 修订版）
│   ├── call-architecture.md      # 通话链路架构文档
│   ├── call-refactor-design.md   # v2.1 通话重构方案
│   └── 2026-06-14-import-memory-image-word-pdf-design.md
├── public/                       # 静态资源
├── scripts/                      # 启动脚本
├── .env.example                  # 环境变量模板
├── next.config.ts
├── tsconfig.json
├── vercel.json
└── package.json
```

---

## 安装与运行

### 前置要求

- Node.js 18+
- Python 3.9+（仅 OCR 功能需要）
- DeepSeek API Key

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# （可选）安装 OCR 服务
npm run ocr:install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填入必要配置：

```bash
cp .env.example .env.local
```

**必需配置：**

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `DEEPSEEK_MODEL` | 模型名称（默认 `deepseek-chat`） |

**可选配置（TTS 语音合成，三选一）：**

| 方案 | 变量 |
|------|------|
| MiniMax（推荐） | `MINIMAX_API_KEY`, `MINIMAX_VOICE=female-shaonv` |
| 火山引擎 | `VOLC_APPID`, `VOLC_ACCESS_TOKEN` |
| Azure | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |

> 未配置 TTS 时，语音电话功能自动降级为浏览器原生 SpeechSynthesis。

### 3. 启动开发服务器

```bash
# 启动 Next.js 开发服务器
npm run dev

# （可选）启动 OCR 服务
npm run ocr:start
```

访问 http://localhost:3000 即可使用。

---

## v2 灰度开关

v2 架构通过 Feature Flag 灰度控制，不影响现有功能：

```bash
# 全局开关（仅测试环境使用）
AGENT_ARCH_VERSION=v2

# 按链路独立灰度（推荐生产环境）
AGENT_V2_CHAT=true    # 子女端聊天链路
AGENT_V2_CALL=true    # 通话链路
AGENT_V2_HOOK=true    # 主动关怀链路

# v2.1 三步编排（需先开启 v2）
AGENT_V21_CALL=true   # 通话链路三步编排
```

v2/v2.1 workflow 抛错时自动 fallback 到 v1，保证服务可用性。

---

## API 接口

### 子女端
| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/agent` | POST | 聊天主入口（意图路由 + 任务创建 + 深度关怀） |
| `/api/companion/chat` | POST | 深度关怀对话（forceIntent=deep_care） |
| `/api/import-memory` | POST | 导入记忆文档（Word/PDF/图片） |
| `/api/care-insights` | GET | 获取关怀洞察列表 |

### 通话链路
| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/calls/start` | POST | 发起 AI 语音电话 |
| `/api/calls/[sessionId]/turn` | POST | 处理通话轮次 |
| `/api/calls/[sessionId]/finalize` | POST | 通话后分析（幂等） |
| `/api/elder-call-conversation` | POST | 长辈端通话（状态机驱动） |
| `/api/elder-chat` | POST | 长辈端文字聊天 |

### 辅助
| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/tts` | POST | 语音合成（多 TTS 提供商） |
| `/api/scheduler/tick` | POST | 定时任务调度 |
| `/api/proactive-messages` | GET | 主动消息列表 |
| `/api/elder-profiles` | GET/POST | 长辈档案管理 |
| `/api/task-templates` | GET/POST | 任务模板管理 |

---

## 安全策略

AI 回复严格遵守以下安全策略：

| 策略 | 说明 |
|------|------|
| `medical_no_diagnosis` | 禁止输出医疗诊断结论 |
| `medical_no_dosage` | 禁止输出具体用药剂量 |
| `cognitive_careful` | 认知障碍话题谨慎处理 |
| `no_impersonation` | 禁止冒充家属（必须说"我是XX设置的念念"） |
| `no_blame_no_guilt` | 禁止责备/制造内疚感 |
| `no_sensitive_extraction` | 禁止提取敏感个人信息 |

---

## 部署

### Vercel 部署（推荐）

项目已部署到 Vercel 生产环境，配置如下：

| 配置项 | 值 |
|--------|-----|
| **域名** | `dianji.weirdwork.cn` |
| **区域** | `hkg1`（香港节点） |
| **框架** | Next.js 16 |
| **仓库** | `github.com/wangmengchen1211/youdiandianji-` |

**Vercel 环境变量清单：**

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（必需） |
| `MINIMAX_API_KEY` | MiniMax TTS 密钥（可选） |
| `MINIMAX_VOICE` | 音色 ID（默认 `female-shaonv`） |
| `TTS_PROVIDER` | 强制指定 TTS（Vercel 建议设为 `browser`） |

> **注意：**
> - OCR 服务（PaddleOCR）需要本地部署，Vercel 环境下 OCR 功能自动降级
> - Vercel 美国服务器无法访问 MiniMax 代理地址，TTS 会自动降级为浏览器原生语音
> - 生产环境建议设置 `TTS_PROVIDER=browser` 跳过服务端 TTS 超时

**阿里云 DNS 配置（CNAME 解析）：**

| 字段 | 值 |
|------|-----|
| 记录类型 | `CNAME` |
| 主机记录 | `dianji` |
| 记录值 | `cname.vercel-dns.com` |
| TTL | 10 分钟 |

### 本地生产环境

```bash
npm run build
npm run start
```

---

## 项目状态

- **v1 架构**：17 个 Agent 并列，功能完整可用（已标记 @deprecated）
- **v2 架构**：已完成实施，通过 Feature Flag 灰度控制
  - 8 个 Cognitive Skills（合并自 17 个 Agent）
  - 5 个 Workflow Orchestrators
  - 三层安全服务
  - 事件总线
  - v1 自动 fallback
- **v2.1 通话重构**：三步编排（UnderstandTurn → DecideNextAction → GenerateReply）
  - LLM 提议，状态机校验（解决状态机管太多的问题）
  - 9 字段完整日志系统
  - 身份锁定（caregiver/elder/assistant 三方角色）
- **生产部署**：已上线 Vercel（`dianji.weirdwork.cn`）

---

## License

Private / Demo Project
