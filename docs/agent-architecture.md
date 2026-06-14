# 有点惦记 — Agent 架构全景文档（v2 修订版）

> 项目全名："突然有点惦记你们"  
> 核心角色：**念念** — 亲情关怀小助理（AI 语音助理）  
> 技术栈：Next.js + DeepSeek LLM + Zod 结构化输出 + 内存 Store  
> **v2 架构状态：已实施，灰度开关控制（Feature Flag）**

---

## 一、系统架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                        API 层 (Next.js Route Handlers)        │
│  /api/agent  /api/companion/chat  /api/calls/*  /api/tts     │
└──────────┬──────────────┬────────────────┬───────────────────┘
           │              │                │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
    │  子女端聊天  │ │ 深度关怀链 │ │  通话链路   │
    │  Agent路由   │ │ deepCare   │ │ Call Orch.  │
    └──────┬──────┘ └─────┬──────┘ └──────┬──────┘
           │              │                │
    ┌──────▼──────────────▼────────────────▼──────┐
    │              Agent 层 (16 个 Agent)           │
    │  Router / TurnPlanner / SafetyGuard / ...    │
    └──────────────────┬──────────────────────────┘
                       │
    ┌──────────────────▼──────────────────────────┐
    │              Service 层                       │
    │  CallOrchestrator / HookService / Scheduler  │
    │  CareCaseService / MemoryService             │
    └──────────────────┬──────────────────────────┘
                       │
    ┌──────────────────▼──────────────────────────┐
    │              Store 层 (Memory Store)          │
    │  Elder / Caregiver / CallSession / Memory    │
    │  TaskTemplate / CareCase / HookCandidate     │
    └─────────────────────────────────────────────┘
```

---

## 二、v2 架构（当前版本）

v2 将 17 个 Agent 并列架构重构为 **Workflow 编排 + Cognitive Skills + Domain Services + Safety + Event Bus** 三层架构。

### v2 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                     API 层 (Next.js Route Handlers)            │
│  /api/agent  /api/companion/chat  /api/calls/*  /api/tts     │
│  [Feature Flag: isV2Enabled("chat"|"call"|"hook")]            │
│  [v2 workflow → Response Adapter → 旧前端 AgentResponse]      │
└──────────┬──────────────┬────────────────┬───────────────────┘
           │              │                │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
    │ chat.       │ │ call.      │ │ hook.       │
    │ workflow    │ │ workflow   │ │ workflow    │
    └──────┬──────┘ └─────┬──────┘ └──────┬──────┘
           │              │                │
    ┌──────▼──────────────▼────────────────▼──────┐
    │         Workflow Orchestrators (5 个)         │
    │  chat / call / post-call / hook / scheduler  │
    └──────────────────┬──────────────────────────┘
                       │
    ┌──────────────────▼──────────────────────────┐
    │       Cognitive Skills (8 个)                 │
    │  IntentSituationClassifier / DeepCareEngine  │
    │  TaskBlueprintExtractor / CallPlanBuilder    │
    │  CallTurnEngine / PostCallExtractor          │
    │  MemoryInsightWriter / HookMessagePlanner    │
    └──────────────────┬──────────────────────────┘
                       │
    ┌──────────────────▼──────────────────────────┐
    │       LLM Provider (llm.service.ts)          │
    └──────────────────┬──────────────────────────┘
                       │
    ┌──────────────────▼──────────────────────────┐
    │       Domain Services + Safety + EventBus     │
    └──────────────────┬──────────────────────────┘
                       │
    ┌──────────────────▼──────────────────────────┐
    │              Store 层 (Memory Store)          │
    └─────────────────────────────────────────────┘
```

### 旧模块 → v2 映射表

| 旧模块 (v1) | v2 替代 | 说明 |
|---|---|---|
| agent-router + situation-recognizer | `cognitive/intent-situation-classifier` | 合并为一次 LLM 调用 |
| depth-planner + probe-generator + case-formulation-builder | `cognitive/deep-care-dialogue-engine` | 合并为一次 LLM 调用 |
| task-designer | `cognitive/task-blueprint-extractor` | 重命名 + 增强 |
| call-plan-generator | `cognitive/call-plan-builder` | 增加 probe_budget / avoid_topics |
| turn-planner | `cognitive/call-turn-engine` | 去掉 memory_candidates，只输出 observations |
| response-understanding | `cognitive/post-call-extractor` | 明确为通话后权威提取器 |
| memory-curator + care-insight-writer | `cognitive/memory-insight-writer` | 合并为一次 LLM 调用 |
| hook-candidate-generator + hook-message-realizer | `workflows/hook.workflow` + `cognitive/hook-message-planner` | HookService 只做纯领域能力 |
| family-context-composer + relationship-context-composer | `services/context.service` | 统一上下文组装 |
| safety-guard | `services/safety.service`（三层） | preCheck + mergePolicy + postCheck |

### SafetyService 三层安全

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

### Feature Flag 灰度切换

```
AGENT_ARCH_VERSION=v2       # 全局开关（仅测试环境）
AGENT_V2_CHAT=true           # 子女端聊天链路
AGENT_V2_CALL=true           # 通话链路
AGENT_V2_HOOK=true           # 主动关怀链路
```

优先级：全局 v2 > 链路级开关 > 默认 v1。v2 workflow 抛错时自动 fallback 到 v1。

---

## 二（旧）、v1 Agent 总清单

| # | Agent 名 | 文件路径 | LLM 调用 | 输出格式 | 所属链路 |
|---|---------|---------|---------|---------|---------|
| 1 | Agent Router | `agents/agent-router.ts` | ✅ | JSON (Zod) | 子女端路由 |
| 2 | Task Designer | `agents/task-designer.ts` | ✅ | JSON (Zod) | 任务创建 |
| 3 | Situation Recognizer | `agents/situation-recognizer.ts` | ✅ | JSON (Zod) | 深度关怀 |
| 4 | Depth Planner | `agents/depth-planner.ts` | ✅ | JSON (Zod) | 深度关怀 |
| 5 | Probe Generator | `agents/probe-generator.ts` | ✅ | 自然语言 | 深度关怀 |
| 6 | Case Formulation Builder | `agents/case-formulation-builder.ts` | ✅ | JSON (Zod) | 深度关怀 |
| 7 | Call Plan Generator | `agents/call-plan-generator.ts` | ✅ | JSON (Zod) | 通话链路 |
| 8 | Relational Conversation | `agents/relational-conversation.ts` | ✅ | JSON (Zod) | 通话链路(旧) |
| 9 | Turn Planner | `agents/turn-planner.ts` | ✅ | JSON (Zod) | 通话链路(核心) |
| 10 | Response Understanding | `agents/response-understanding.ts` | ✅ | JSON (Zod) | 通话后提取 |
| 11 | Memory Curator | `agents/memory-curator.ts` | ✅ | JSON (Zod) | 通话后记忆 |
| 12 | Care Insight Writer | `agents/care-insight-writer.ts` | ✅ | JSON (Zod) | 通话后洞察 |
| 13 | Safety Guard | `agents/safety-guard.ts` | ❌ 纯规则 | 文本修复 | 全局安全层 |
| 14 | Relationship Context Composer | `agents/relationship-context-composer.ts` | ❌ 纯数据 | 上下文对象 | 通话链路 |
| 15 | Family Context Composer | `agents/family-context-composer.ts` | ❌ 纯数据 | 上下文对象 | 全局上下文 |
| 16 | Hook Candidate Generator | `agents/hook-candidate-generator.ts` | ✅ | JSON (Zod) | 主动关怀 |
| 17 | Hook Message Realizer | `agents/hook-message-realizer.ts` | ✅ | 自然语言 | 主动关怀 |

---

## 三、各 Agent 详细说明

---

### 3.1 Agent Router（统一意图路由器）

**文件**：`src/lib/agents/agent-router.ts`  
**Prompt**：`src/lib/agents/prompts/agent-router.prompt.ts`  
**Schema**：`src/lib/agents/schemas/agent-router.schema.ts`

#### 职责
作为所有子女端输入的**第一道分类器**，判断用户意图并路由到对应处理链路。

#### 人设
> "你是'突然有点惦记你们'的统一路由分类 Agent。"

#### 输入上下文
- `user_input`：用户原始输入
- `elder` / `caregiver`：当前长辈和子女信息
- `known_elders`：所有已知长辈列表
- `open_care_cases`：未结案的关怀案例
- `recent_call_summaries`：最近 3-5 次通话摘要
- `recent_care_insights`：最近 5 条亲情洞察
- `memories`：长期记忆
- `relationship_profile`：关系档案（共享回忆/敏感话题/沟通风格）

#### 输出 Schema
```json
{
  "kind": "createTask | rewriteNote | querySummary | addElder | deepCare | unknown",
  "confidence": 0.85,
  "reason": "用户表达了对妈妈记忆的担忧",
  "situation_analysis": {  // 仅 deepCare 时附带
    "situation_type": "possible_cognitive_decline",
    "risk_level": "medium",
    "explicit_need": "想了解妈妈忘事是不是正常"
  }
}
```

#### SOP
1. 接收用户输入 + FamilyContext
2. LLM 分类意图（temperature=0.2，低随机性）
3. 若 `kind=deepCare` 且 `confidence ≥ 0.7` → 进入深度关怀链路
4. 否则 → 返回给前端，由旧 Agent 系统处理 createTask/rewriteNote/querySummary/addElder
5. LLM 失败 → 兜底为 `unknown`，confidence=0.3

#### 调用者
- `/api/agent/route.ts`（子女端主聊天 API）
- `/api/companion/chat/route.ts`（深度关怀专用 API）

---

### 3.2 Task Designer（任务设计 Agent）

**文件**：`src/lib/agents/task-designer.ts`  
**Prompt**：`src/lib/agents/prompts/task-designer.prompt.ts`  
**Schema**：`src/lib/agents/schemas/task-designer.schema.ts`

#### 职责
将家属的一句话输入解析为**结构化的每日关怀电话任务蓝图**（TaskBlueprint）。

#### 人设
> "你是'突然有点惦记你们'的任务设计 Agent。"

#### 输入
```json
{
  "user_text": "帮我每天晚上8点提醒妈妈吃药",
  "current_elder_id": "elder_001",
  "known_elders": [{ "elderId": "elder_001", "displayName": "妈妈", "nicknames": ["妈"] }]
}
```

#### 输出
```json
{
  "intent": "create_daily_care_call",
  "need_follow_up": false,
  "follow_up_question": null,
  "missing_fields": [],
  "task_blueprint": {
    "elder_id": "elder_001",
    "elder_display_name": "妈妈",
    "title": "提醒妈妈吃药",
    "task_type": "daily_care_call",
    "recurrence_rule": { "type": "daily", "time": "20:00", "timezone": "Asia/Shanghai" },
    "primary_objectives": [{ "type": "reminder", "content": "提醒吃药" }],
    "relationship_objectives": [{ "type": "express_care", "content": "关心妈妈身体" }],
    "required_slots": ["medication_taken"],
    "retry_policy": { "max_attempts": 2, "retry_after_minutes": 30 },
    "call_policy": { "max_duration_seconds": 180, "max_extra_questions": 2, "tone": "warm" }
  }
}
```

#### SOP
1. 解析用户自然语言 → 提取目标长辈、时间、任务内容
2. 信息不完整 → `need_follow_up=true` + 生成追问
3. 信息完整 → 输出 TaskBlueprint
4. 不编造长辈 ID，必须从已知列表匹配

---

### 3.3 Situation Recognizer（情境识别 Agent）

**文件**：`src/lib/agents/situation-recognizer.ts`  
**Prompt**：`src/lib/agents/prompts/situation-recognizer.prompt.ts`  
**Schema**：`src/lib/agents/schemas/situation-recognizer.schema.ts`

#### 职责
深度关怀链路的**第一步**：分析家属输入，识别情境类型和风险等级。

#### 人设
> "你是'突然有点惦记你们'的情境识别 Agent（念念）。"

#### 情境类型枚举
| 类型 | 含义 |
|-----|------|
| `possible_cognitive_decline` | 疑似认知衰退 |
| `elder_health_change` | 长辈健康变化 |
| `elder_emotional_distress` | 长辈情绪困扰 |
| `caregiver_burnout` | 照护者疲惫 |
| `parent_child_conflict` | 亲子矛盾 |
| `guilt_and_distance` | 愧疚与距离 |
| `missed_medication` | 漏服药物 |
| `safety_risk` | 安全风险 |
| `loneliness_signal` | 孤独信号 |
| `routine_care_task` | 日常关怀任务 |
| `relationship_repair` | 关系修复 |
| `festival_or_anniversary_care` | 节日/纪念日关怀 |

#### 输出
```json
{
  "situation_type": "possible_cognitive_decline",
  "secondary_types": ["elder_emotional_distress"],
  "risk_level": "medium_high",
  "explicit_need": "想了解妈妈忘事是否正常",
  "implicit_needs": ["需要情感支持", "可能需要专业评估"],
  "missing_info": ["忘事的具体频率", "是否影响日常生活"],
  "recommended_strategy": "ask_targeted_questions",
  "forbidden_response": ["不能说'你妈妈就是老年痴呆'", "不要下诊断结论"]
}
```

#### 关键规则
- **绝不提供医疗诊断**；有症状时 risk_level ≥ medium_high
- 风险判断保守：宁可高估
- 利用 `recent_call_summaries` 判断"新问题 vs 老问题"
- 利用 `memories` 中的慢性病/药物信息提醒家属

---

### 3.4 Depth Planner（深度对话规划 Agent）

**文件**：`src/lib/agents/depth-planner.ts`  
**Prompt**：`src/lib/agents/prompts/depth-planner.prompt.ts`  
**Schema**：`src/lib/agents/schemas/depth-planner.schema.ts`

#### 职责
深度关怀链路**第二步**：根据情境分析规划对话路径，决定追问方向和是否建立案例。

#### 人设
> "你是'突然有点惦记你们'的深度对话规划 Agent。"

#### 输入
- `situation_analysis`：上游情境识别结果
- `conversation_history`：最近 6 轮对话
- `open_care_cases`：已有案例的已知事实/未知项
- `recent_call_summaries` / `recent_care_insights`：避免重复追问
- `relationship_profile`：共享回忆可作为话题切入

#### 输出
```json
{
  "conversation_stage": "深入追问",
  "goal": "了解妈妈忘事的具体表现和频率",
  "ask_dimensions": ["最近睡眠质量", "忘事的具体内容类型", "爸爸有没有注意到"],
  "questions": [
    "妈妈最近晚上睡得还好吗？有没有说头疼什么的？",
    "她忘的主要是刚说过的事，还是以前的事也记不清了？"
  ],
  "response_style": "warm_and_natural",
  "should_create_case": true,
  "case_type": "possible_cognitive_decline"
}
```

#### 关键规则
- 追问像家人聊天，不像医生问诊
- 每轮只追问 1-2 个维度
- `risk_level=high` → `should_create_case` 必须为 true
- 优先从通话历史/洞察中承接子话题

---

### 3.5 Probe Generator（追问生成 Agent）

**文件**：`src/lib/agents/probe-generator.ts`  
**Prompt**：`src/lib/agents/prompts/probe-generator.prompt.ts`

#### 职责
深度关怀链路**第三步**：生成 1-3 个自然温暖的追问，帮家属说出更多真实想法。

#### 人设
> "你是'突然有点惦记你们'的追问生成 Agent（念念）。"

#### 输出
自然语言文本（非 JSON），每行一个追问。

#### 好的追问示例
- "妈妈最近有没有提过，她觉得哪里不太舒服但又不想说？"
- "你说她最近老忘事，是忘什么东西比较多？吃药、做饭、还是刚说过的事？"
- "上次电话里妈妈提到腿有点酸，这几天怎么样了？"

#### 禁止的追问
- "请描述患者近3个月的认知功能变化"（医生腔）
- "建议尽快去医院做个检查"（下结论）
- "你怎么不早点带她去看？"（制造愧疚）

---

### 3.6 Case Formulation Builder（关怀案例构建 Agent）

**文件**：`src/lib/agents/case-formulation-builder.ts`  
**Prompt**：`src/lib/agents/prompts/case-formulation-builder.prompt.ts`  
**Schema**：`src/lib/agents/schemas/case-formulation.schema.ts`

#### 职责
深度关怀链路**第四步（可选）**：从多轮对话中提取结构化更新，持续维护 CareCase。

#### 人设
> "你是'突然有点惦记你们'的关怀案例构建 Agent。"

#### 输出
```json
{
  "new_known_facts": ["妈妈今天血压130/85", "最近睡眠不好，凌晨3点醒"],
  "updated_unknowns": ["是否在服用降压药", "睡眠问题持续多久了"],
  "new_risk_flags": [{ "type": "health", "content": "血压偏高", "level": "medium" }],
  "updated_next_steps": ["建议小雨周末打电话问问妈妈的睡眠情况"],
  "follow_up_at": "2026-06-20T10:00:00Z",
  "status_change": null
}
```

#### 关键规则
- 只追加新信息，不重复已知事实
- 利用 `recent_call_summaries` 判断事实是否已登记
- 将 `recent_care_insights` 中的关系洞察转化为 next_steps

---

### 3.7 Call Plan Generator（通话计划生成 Agent）

**文件**：`src/lib/agents/call-plan-generator.ts`  
**Prompt**：`src/lib/agents/prompts/call-plan-generator.prompt.ts`  
**Schema**：`src/lib/agents/schemas/call-plan.schema.ts`

#### 职责
通话链路**第一步**：在电话接通后，基于任务目标和关系上下文生成分阶段通话计划。

#### 人设
> "你是'突然有点惦记你们'的通话计划生成 Agent。"

#### 通话阶段结构
| 阶段 | 标识 | 目标 |
|------|------|------|
| 1 | `identity_and_consent` | 说明身份（"我是XX设置的念念"），不冒充子女 |
| 2 | `warm_greeting` | 自然问候，先寒暄 |
| 3 | `child_update` | 转达子女授权的近况 |
| 4 | `open_care_question` | 关心老人今天的状态 |
| 5 | `task_reminder` | 完成核心提醒 |
| 6 | `ask_relay_message` | 询问老人有没有话带给子女 |
| 7 | `closing` | 温柔结束 |

#### 特色机制
- **关怀话题轮换**：维护 6 个话题数组，根据历史通话次数轮换，避免每次问同样的问题
- **传话改写**：将原始 relay message 改写为温暖版本（如"忙"→"TA特意让我来问问您"）

#### 输出
```json
{
  "call_plan_id": "call_001",
  "max_duration_seconds": 180,
  "max_extra_questions": 2,
  "stages": [
    { "stage": "identity_and_consent", "goal": "说明身份并自然开场",
      "sample_script": "阿姨您好呀~我是小雨设置的小助理念念，TA今天惦记您啦~" },
    ...
  ]
}
```

---

### 3.8 Turn Planner（轮次规划 Agent）⭐ 核心

**文件**：`src/lib/agents/turn-planner.ts`  
**Prompt**：`src/lib/agents/prompts/turn-planner.prompt.ts`  
**Schema**：`src/lib/agents/schemas/turn-planner.schema.ts`

#### 职责
通话链路**每一轮对话的核心引擎**，在一次 LLM 调用中同时完成：分析 + 规划 + 生成回复 + 状态更新 + 记忆候选。

#### 人设
> "你是念念，一个温柔、有分寸的亲情关怀助理。你正在和长辈通电话。"

#### 输入上下文
```json
{
  "elder_text": "吃了吃了，今天早饭后就吃了",
  "elder": { "displayName": "妈妈", "relation": "mother", ... },
  "caregiver": { "displayName": "小雨", ... },
  "current_stage": "task_reminder",
  "current_stage_goal": "核心提醒",
  "transcript": [...最近8轮...],
  "task_slots_collected": {},
  "turn_count": 4,
  "probe_budget": { "totalRemaining": 3, "healthRemaining": 1, "relationshipRemaining": 2 },
  "elder_willingness": "willing",
  "should_close_soon": false,
  "relationship_memory": ["妈妈喜欢聊做菜", "上次提到腿酸"],
  "sensitive_topics": ["不要提爸爸的事"]
}
```

#### 输出（四部分）
```json
{
  "analysis": {
    "factual_info": { "medication_taken": true, "time": "早饭后" },
    "task_slots": { "medication_taken": true },
    "relationship_signals": [],
    "emotion": { "label": "neutral", "confidence": 0.8 },
    "probe_opportunities": [{ "type": "health", "question_goal": "确认食欲", "priority": "normal" }],
    "stage_completed": true,
    "should_end_call": false
  },
  "next": {
    "action": "ask_relay",
    "stage": "ask_relay_message",
    "reason": "任务槽位已收集完毕，进入询问带话",
    "assistant_text": "好的呀，记下来啦~对了对了，小雨有没有什么想跟您说的？要不要我帮您转告？",
    "is_call_ending": false
  },
  "state_patch": {
    "task_slots": { "medication_taken": true },
    "probe_budget": { "totalRemaining": 2 }
  },
  "memory_candidates": [
    { "type": "routine_memory", "content": "妈妈习惯早饭后吃药", "confidence": 0.9 }
  ]
}
```

#### 通话收尾决策（P1-5 设计）
- **LLM 主导决策**：状态机不再强行覆盖 LLM 的收尾判断
- **硬上限**：elapsed_seconds > 240 / turn_count > 12 → 强制结束
- **软信号**：`should_close_soon=true` 透传给 LLM 作为建议
- **情绪留白**：长辈刚表露情绪（想你、想家）→ 可多留 1-2 回合

#### 智能兜底机制
当 LLM 调用失败时，根据当前 stage + 长辈上句话生成不模板化的回复（如 open_care_question 阶段根据"好/不好"关键词选择不同回应）。

---

### 3.9 Relational Conversation（亲情对话 Agent，旧版）

**文件**：`src/lib/agents/relational-conversation.ts`  
**Prompt**：`src/lib/agents/prompts/relational-conversation.prompt.ts`

#### 职责
通话链路**旧版**对话生成，目前仅用于通话开场第一句话（identity_and_consent 阶段）。已被 Turn Planner 取代主要对话生成职责。

#### 人设（极其详细的话术规范）
> "你是'突然有点惦记你们'的亲情关怀助理'念念'。"
> - 语气像活泼温暖的小妹妹/晚辈
> - 多用语气词：呀、呢、嘛、啦、哦、~
> - 多用可爱表达：嗯嗯、好的呀、知道啦、没问题~
> - 少用命令式："必须""应该""请立即"
> - 每句话尽量不超过 25 个字
> - 先寒暄，再提醒
> - 不责备长辈，不制造焦虑，不提供医疗诊断

#### 关系原则
- 可代表家属转达已授权信息
- 不得编造家属近况
- 不得假装自己是家属本人
- 不得夸大长辈情绪

---

### 3.10 Response Understanding（回复理解 / 通话后提取 Agent）

**文件**：`src/lib/agents/response-understanding.ts`  
**Prompt**：`src/lib/agents/prompts/response-understanding.prompt.ts`  
**Schema**：`src/lib/agents/schemas/response-understanding.schema.ts`

#### 职责
通话结束后，从完整通话记录中提取**结构化结果**：任务完成状态、槽位、风险信号、长辈传话。

#### 人设
> "你负责从老人电话回复中提取结构化信息。你只能基于老人原话提取，不得编造。"

#### 输出
```json
{
  "task_status": "completed",
  "slots": { "medication_taken": true, "general_condition": "还好" },
  "risk_signals": [
    { "type": "symptom", "content": "提到头晕", "severity": "medium", "should_notify_caregiver": true }
  ],
  "message_to_child": "跟小雨说我没事，让她别担心",
  "confidence": 0.85,
  "needs_review": false
}
```

#### 调用时机
- `finalizeCall()` 中作为 Post-call Extractor 使用
- 已被标记为 `@deprecated`（实时分析由 Turn Planner 接管）

---

### 3.11 Memory Curator（记忆策展 Agent）

**文件**：`src/lib/agents/memory-curator.ts`  
**Prompt**：`src/lib/agents/prompts/memory-curator.prompt.ts`  
**Schema**：`src/lib/agents/schemas/memory-curator.schema.ts`

#### 职责
通话结束后，从通话记录中**提取值得长期保存的记忆**写入档案。

#### 人设
> "你是亲情关怀产品的记忆策展器。你的任务不是保存所有通话内容，而是判断哪些内容值得写入长期档案或关系档案。"

#### 提取 6 类记忆
| 类型 | 说明 | 示例 |
|------|------|------|
| `health_memory` | 健康数据 | "血压 130/85"、"血糖 6.5" |
| `routine_memory` | 生活习惯 | "习惯早饭后吃药" |
| `preference_memory` | 沟通偏好 | "喜欢被叫'阿姨'" |
| `relationship_memory` | 关系模式 | "每次提到小雨都会笑" |
| `relay_memory` | 对家属的牵挂 | "让小雨多吃水果" |
| `emotional_signal` | 情绪信号 | "说到过年时声音哽咽" |

#### 过滤规则
- ❌ 无意义寒暄
- ❌ 低价值闲聊
- ❌ 不确定且可能误导的信息
- ❌ 没有证据支持的推测
- ✅ 情绪推测必须标记 `requires_review=true`

---

### 3.12 Care Insight Writer（亲情洞察 Agent）

**文件**：`src/lib/agents/care-insight-writer.ts`  
**Prompt**：`src/lib/agents/prompts/care-insight-writer.prompt.ts`  
**Schema**：`src/lib/agents/schemas/care-insight.schema.ts`

#### 职责
通话结束后，生成**有温度的亲情洞察报告**给家属——不是工单，不是医疗报告。

#### 人设
> "你是一个亲情关怀助理'念念'，负责把长辈电话后的结果告诉家属。你要像一个懂事、温柔、有分寸的人。"

#### 输出（四维结构）
```json
{
  "factual_summary": "妈妈今天早饭后吃了药，血压130/85，精神不错",
  "relationship_insight": "妈妈听说你最近加班，第一反应是让你好好吃饭。她嘴上说不用你操心，但其实挺惦记你。",
  "suggested_action": "如果有时间，可以晚上给妈妈回个电话，聊聊做菜的事她会开心",
  "suggested_message": "妈，今天听念念说你精神不错，我就放心啦~注意身体呀",
  "confidence": 0.85
}
```

#### 关键规则
- 事实摘要**必须从 transcript 找到具体依据**
- 关系洞察要有温度：捕捉说漏嘴的关心、欲言又止的想念、嘴硬心软的表达
- 感受判断用"我感觉/听起来/可能"表达
- 不夸大、不煽情、不制造愧疚

---

### 3.13 Safety Guard（安全守卫）⭐ 全局

**文件**：`src/lib/agents/safety-guard.ts`  
**无 LLM 调用** — 纯规则引擎

#### 职责
**所有 Agent 输出的安全防线**，使用两层模式匹配检测和修复违规内容。

#### 两层检测机制

**Layer 1（强禁止）**：
| 违规类型 | 示例 | 处理 |
|---------|------|------|
| 冒充子女 | "我是小雨" | 替换为"我是小雨设置的念念" |
| 医疗建议 | "你应该吃两片" | 替换为"我帮您记下来，也会告诉家人" |
| 责备长辈 | "你怎么又忘了" | 替换为"提醒您一下" |
| 诊断结论 | "她就是老年痴呆" | 兜底安全话术 |
| 保证疗效 | "吃了肯定能好" | 拦截 |
| 敏感信息套取 | "你家存折多少" | 拦截 |
| 制造家属愧疚 | "孩子太辛苦了你别..." | 警告 |

**Layer 2（安全放行）**：
- "不能判断""不确定""建议评估" → 视为安全表达，不下诊断
- 当 Layer 1 仅触发诊断类违规 + Layer 2 匹配到安全表达 → 降级为通过

#### 调用时机
1. **通话每轮**：`processTurn()` 中对 Turn Planner 输出做安全检查
2. **通话开场**：`startCall()` 中对开场白做安全检查
3. **通话后洞察**：`finalizeCall()` 中对 Care Insight 的 suggestedMessage 做安全检查

---

### 3.14 Relationship Context Composer（关系上下文组装器）

**文件**：`src/lib/agents/relationship-context-composer.ts`  
**无 LLM 调用** — 纯数据组装

#### 职责
为通话链路组装 `RelationshipContext` 对象，包含长辈档案、子女近况、关系记忆、通话历史、待传消息。

#### 数据来源（全部从 Memory Store 读取）
- `store.getElder()` → 长辈基本信息
- `store.getCaregiver()` → 子女信息
- `store.getRelationshipProfile()` → 关系档案
- `store.getUpdatesForCaregiver()` → 子女近况（仅 `canShareWithElder=true`）
- `store.getMemoriesForElder()` → 关系类记忆
- `store.getRecentCallSummaries()` → 最近通话摘要
- `store.getPendingRelayMessages()` → 待传消息

---

### 3.15 Family Context Composer（统一家庭上下文组装器）

**文件**：`src/lib/agents/family-context-composer.ts`  
**无 LLM 调用** — 纯数据组装

#### 职责
**所有 Agent 的统一上下文加载器**。比 Relationship Context Composer 更完整，增加了 CareCase、CareInsight、用户风格等。

#### 输出的 FamilyContext 包含
| 字段 | 说明 |
|------|------|
| `familyId` | 家庭 ID |
| `caregiver` | 子女信息 + 可分享的近况 |
| `elder` | 长辈信息 + 沟通风格 + 健康关注点 |
| `relationshipProfile` | 共享回忆 / 敏感话题 / 偏好沟通风格 |
| `memories` | 所有类型长期记忆 |
| `openCareCases` | 未结案的关怀案例 |
| `recentCallSummaries` | 最近 3-5 次通话摘要 |
| `recentCareInsights` | 最近 5 条亲情洞察 |
| `pendingRelayMessages` | 待传消息 |
| `todayObjectives` | 今日任务目标 |
| `userStyle` | 语气偏好 / 避免话题 / 期望风格 |

---

### 3.16 Hook Candidate Generator（Hook 候选生成 Agent）

**文件**：`src/lib/agents/hook-candidate-generator.ts`  
**Prompt**：`src/lib/agents/prompts/hook-candidate-generator.prompt.ts`  
**Schema**：`src/lib/agents/schemas/hook-candidate.schema.ts`

#### 职责
主动关怀链路：根据系统事件评估是否应生成主动消息候选。

#### 人设
> "你是'突然有点惦记你们'的 Hook 候选生成 Agent。"

#### 事件类型枚举
| 事件 | 触发场景 |
|------|---------|
| `task_completed` | 长辈关怀任务完成 |
| `task_failed` | 任务未完成 |
| `elder_abnormal_response` | 通话中异常回应 |
| `elder_relay_message` | 长辈有话带给你 |
| `caregiver_inactive_6h/24h` | 子女长时间未查看 App |
| `care_case_opened` | 新关怀案例创建 |
| `care_case_unresolved_24h` | 案例 24h 未解决 |
| `festival_approaching` | 节日即将到来 |
| `repeated_symptom_detected` | 重复症状检测 |
| `caregiver_burnout_signal` | 照护疲劳信号 |

---

### 3.17 Hook Message Realizer（Hook 消息生成 Agent）

**文件**：`src/lib/agents/hook-message-realizer.ts`  
**Prompt**：`src/lib/agents/prompts/hook-message-realizer.prompt.ts`

#### 职责
将 Hook 候选转化为 30-100 字的**自然温暖消息**。

#### 人设
> "你是'突然有点惦记你们'的主动消息生成 Agent（念念）。"

#### 示例
- ❌ "系统检测到您母亲血压异常"
- ✅ "阿姨今天血压有点高，我帮她记下来了。你有空的时候问问她是不是忘了吃药？"

---

## 四、核心 Service 层

---

### 4.1 Call Orchestrator（通话编排器）⭐

**文件**：`src/lib/services/call-orchestrator.ts`

#### 职责
管理通话的完整生命周期：**拨号 → 生成计划 → 逐轮对话 → 通话结束 → 后处理**。

#### 三个核心函数

**`startCall(taskOccurrenceId)`** — 通话启动
```
1. 查找 TaskOccurrence + TaskTemplate + Elder
2. 创建 CallSession（状态机初始化为 identity_and_consent）
3. 通过 TelephonyProvider 拨号
4. 接通后：composeRelationshipContext() → generateCallPlan()
5. 生成开场白（Relational Conversation Agent）
6. Safety Guard 检查开场白
7. 推进状态到 warm_greeting
8. 持久化 CallSession
```

**`processTurn(sessionId, elderInput)`** — 逐轮对话（核心循环）
```
1. 加载 session + callPlan + familyContext
2. 长辈输入追加到 transcript
3. 调用 Turn Planner（analysis + planning + generation 一步完成）
4. Safety Guard 双层安全检查
5. 合并 state_patch → conversationState
6. 确定性约束（probe budget / shouldEndCall / listen_and_reflect）
7. 助手回复追加到 transcript
8. 持久化 session
9. 返回增强响应（emotion / signals / safety status）
```

**`finalizeCall(sessionId)`** — 通话后处理
```
1. 结束电话（TelephonyProvider）
2. 构建通话摘要
3. Memory Curator → 提取记忆 → 写入 Memory Store
4. Response Understanding → 提取结构化任务结果
5. Care Insight Writer → 生成亲情洞察
6. Safety Guard → 检查洞察消息
7. 保存 CareInsight
8. 若有长辈传话 → 创建 RelayMessage
9. 更新 TaskOccurrence 状态
10. 推进 TaskTemplate 下次执行时间
```

---

### 4.2 Conversation State Machine（通话状态机）

**文件**：`src/lib/services/conversation-state-machine.ts`

#### 职责
**确定性控制通话阶段流转**（LLM 只生成对话内容，不决定阶段切换）。

#### 阶段顺序
```
identity_and_consent → warm_greeting → child_update → open_care_question
→ [listen_and_reflect] → task_reminder → [confirm_task] → ask_relay_message
→ closing → post_call_analysis
```

#### 关键跳转规则
- `open_care_question` → 长辈回复含情绪关键词且 >30 字 → 进入 `listen_and_reflect`
- `open_care_question` → 长辈简短回答 → 跳过直接到 `task_reminder`
- `task_reminder` → 槽位已收集 → 跳过 `confirm_task` 直接到 `ask_relay_message`

#### 通话结束条件（硬限制）
| 条件 | 阈值 |
|------|------|
| 长辈明确拒绝 | `elderWillingness=refused` |
| 超时 | `elapsedSeconds > 240`（4分钟） |
| 超轮次 | `turnCount > 12` |

#### Probe Budget（追问预算）
| 预算 | 初始值 | 说明 |
|------|-------|------|
| total | 3 | 总追问次数 |
| health | 1 | 健康类追问 |
| relationship | 2 | 关系类追问 |

预算耗尽 → `shouldCloseSoon=true`（软信号，LLM 参考但不强制）

---

### 4.3 Hook Service（主动关怀服务）

**文件**：`src/lib/services/hook-service.ts`

#### 职责
管理主动关怀消息的完整生命周期：事件处理 → 候选创建 → 评分 → 消息生成 → 发送。

#### 评分模型（纯规则，无 LLM）
7 维加权评分：
| 维度 | 权重 | 说明 |
|------|------|------|
| importance | 0.25 | 事件重要性 |
| timeliness | 0.20 | 时效性 |
| relationshipValue | 0.20 | 关系价值 |
| riskLevel | 0.15 | 风险等级 |
| userBurden | 0.10 | 用户负担（反向） |
| repetitionPenalty | 0.05 | 重复惩罚（反向） |
| intrusionRisk | 0.05 | 打扰风险（反向） |

#### 推送决策
- `finalScore ≥ 0.75` → 主动推送（push）
- `0.55 ≤ finalScore < 0.75` → 仅 App 内展示
- `finalScore < 0.55` → 不打扰

#### 保护机制
- 每日最多 2 条推送
- 每日最多 1 条敏感消息
- 静默时间：22:00 - 08:00（延迟到早 8 点）
- 同一案例 12 小时内冷却

---

### 4.4 Scheduler Service（调度服务）

**文件**：`src/lib/services/scheduler-service.ts`

#### 职责
定时扫描到期的 TaskTemplate，创建 TaskOccurrence，触发通话，处理到期 Hook 消息。

#### SOP
```
schedulerTick(now):
  1. 获取所有 active 状态的 TaskTemplate
  2. 对每个到期 template：
     a. 幂等检查（不重复创建 occurrence）
     b. 创建 TaskOccurrence
     c. 调用 startCall() → 启动通话
  3. 处理到期的 ProactiveMessage → markSent
  4. 返回触发/跳过/消息统计
```

---

### 4.5 Care Case Service（关怀案例服务）

**文件**：`src/lib/services/care-case-service.ts`

#### 职责
管理 CareCase 生命周期：创建、追加事实、更新未知项、添加风险标记、更新下一步、安排跟进、变更状态。

#### 核心函数
- `createCareCase()` → 创建新案例（status=open）
- `applyCaseFormulation()` → 将 CaseFormulationBuilder 的输出应用到案例
- `changeCaseStatus()` → open / resolved / escalated

---

## 五、完整链路流程

---

### 5.1 子女端聊天链路

```
用户输入 → /api/agent
  │
  ├─ composeFamilyContext()
  ├─ routeAgentRequest() ← Agent Router
  │
  ├─ kind=deepCare + confidence≥0.7?
  │   ├─ YES → 深度关怀链路（见 5.2）
  │   └─ NO  → 旧系统处理（DeepSeek 直接调用）
  │            ├─ kind=createTask → 返回任务草稿
  │            ├─ kind=rewriteNote → 返回改写纸条
  │            ├─ kind=querySummary → 返回摘要
  │            └─ kind=addElder → 引导添加长辈
```

### 5.2 深度关怀链路

```
routeAgentRequest() → kind=deepCare
  │
  ├─ Step 1: recognizeSituation() ← Situation Recognizer
  │   └─ risk_level=high? → 直接返回安全指导建议
  │
  ├─ Step 2: planDepth() ← Depth Planner
  │
  ├─ Step 3: generateProbes() ← Probe Generator
  │
  └─ Step 4 (可选): buildCaseFormulation() ← Case Formulation Builder
      └─ applyCaseFormulation() → 创建/更新 CareCase
```

### 5.3 通话链路

```
Scheduler Tick
  │
  ├─ getActiveTaskTemplates() → 找到到期任务
  ├─ createOccurrence() → 创建 TaskOccurrence
  │
  └─ startCall()
      ├─ TelephonyProvider.startCall() → 拨号
      │   └─ 未接通 → 标记 no_answer/failed
      │
      ├─ 接通后：
      │   ├─ composeRelationshipContext() ← Relationship Context Composer
      │   ├─ generateCallPlan() ← Call Plan Generator
      │   ├─ generateConversationReply() ← Relational Conversation（开场白）
      │   └─ sanitizeAssistantReply() ← Safety Guard
      │
      └─ processTurn() [循环，每轮一次]
          ├─ composeFamilyContext() ← Family Context Composer
          ├─ planTurn() ← Turn Planner ⭐
          │   ├─ analysis: 提取事实/槽位/信号/情绪
          │   ├─ next: 生成回复 + 决定下一阶段
          │   ├─ state_patch: 更新状态
          │   └─ memory_candidates: 标记新记忆
          │
          ├─ checkSafety() ← Safety Guard（两层检测）
          ├─ 合并 state_patch → conversationState
          ├─ 确定性约束（budget/endCall/listenAndReflect）
          │
          └─ isCallEnding?
              └─ finalizeCall()
                  ├─ extractMemories() ← Memory Curator
                  ├─ extractPostCallSummary() ← Response Understanding
                  ├─ generateCareInsight() ← Care Insight Writer
                  ├─ sanitizeCareInsight() ← Safety Guard
                  ├─ saveCareInsight()
                  ├─ 创建 RelayMessage（如有）
                  └─ advanceNextRunAt()
```

### 5.4 主动关怀链路

```
事件发生（通话完成/任务失败/异常回应/节日/...）
  │
  └─ processHookEvent()
      ├─ 幂等检查（去重）
      ├─ createHookCandidate()
      │   ├─ 案例冷却检查（12h）
      │   └─ 静默时间检查（22:00-08:00）
      │
      ├─ scoreHookCandidate()（纯规则 7 维评分）
      │
      └─ finalScore 判定
          ├─ ≥ 0.75 → realizeHookMessage() → 主动推送
          │   └─ realizeHookMessageText() ← Hook Message Realizer
          ├─ ≥ 0.55 → App 内展示
          └─ < 0.55 → 丢弃
```

---

## 六、数据结构概览

### 核心实体
| 实体 | 说明 |
|------|------|
| `Elder` | 长辈档案（姓名/关系/电话/时区/可用时间/沟通偏好/健康关注点） |
| `Caregiver` | 子女档案（姓名/角色/写作风格） |
| `RelationshipProfile` | 关系档案（语气画像/共享回忆/敏感话题/偏好沟通风格） |
| `TaskTemplate` | 任务模板（循环规则/目标/槽位/重试策略/通话策略） |
| `TaskOccurrence` | 任务实例（每次执行的具体记录） |
| `CallSession` | 通话会话（状态/通话计划/对话记录/持续时间） |
| `ConversationState` | 通话状态（阶段/轮次/槽位/风险信号/追问预算/长辈意愿） |
| `Memory` | 长期记忆（6类：健康/习惯/偏好/关系/传话/情绪） |
| `CareInsight` | 亲情洞察（事实摘要/关系洞察/建议行动/建议消息） |
| `CareCase` | 关怀案例（已知事实/未知项/风险标记/下一步/跟进时间） |
| `RelayMessage` | 传话（双向：子女→长辈 或 长辈→子女） |
| `HookEvent` | 系统事件（13种类型） |
| `HookCandidate` | Hook 候选（评分/触发原因/消息目标） |
| `ProactiveMessage` | 主动消息（渠道/内容/状态） |

---

## 七、安全设计总结

| 层级 | 机制 | 说明 |
|------|------|------|
| Agent Prompt | 系统提示词约束 | 禁止诊断/冒充/责备/说教 |
| Safety Guard L1 | 强禁止模式匹配 | 7 类违规检测 + 自动修复 |
| Safety Guard L2 | 安全表达放行 | "不确定""建议评估"不算违规 |
| 结构化约束 | `checkStructuredOutput()` | 检测 probe budget 超限 |
| 通话状态机 | 硬上限保护 | 4分钟/12轮/拒绝即停 |
| 记忆审查 | `requiresReview` 标记 | 情绪推测类记忆需人工确认 |
| 消息频率 | Hook Service 限流 | 日限/冷却/静默时间 |
