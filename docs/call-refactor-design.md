# 通话链路重构方案

> **核心判断**：状态机"管太多了"，应该 **LLM 提议，状态机校验**，而不是 **状态机拍板，LLM 填空**。

---

## 问题分析

### 三个根因

| 问题 | 根因 | 现象 |
|------|------|------|
| **分不清你的身份** | 会话上下文没有锁定 `caregiver / elder / assistant` 三方角色 | 测试时把"你"到底是子女还是老人混了 |
| **"方便"被当成"不方便"** | 意图识别 bug，正则写成包含匹配或 `end_requested` 规则太宽 | 长辈说"方便"被错误判断为拒绝 |
| **反复说"我记住了，我在听"** | 状态卡在 `listen_and_reflect`，`stageCompleted` 没推进 | LLM 被限制成"只能倾听"，不能自主决定进入下一阶段 |

### 架构问题（当前）

```
长辈输入 → 正则/状态机误判 → workflow 强行推进/结束 → LLM 只能在错误状态里补一句话
```

**核心问题**：
1. 状态机完全主导阶段推进，LLM 只能填空
2. 意图识别缺失：没有结构化的 intent 字段
3. 没有完整日志系统来调试
4. `nextStage()` 函数硬编码规则，完全不看 LLM 的意图分析

---

## 重构目标

### 正确的边界

| 层级 | 职责 | 不做 |
|------|------|------|
| **状态机** | 身份锁定、安全规则、最大轮数、是否能结束、任务是否归档 | 用死规则替 LLM 理解语义 |
| **LLM** | 理解语义、自然回复、判断是否该继续聊/切任务 | 安全校验、硬性结束条件 |
| **意图识别** | 解析长辈这句话是什么意图 | 状态流转决策 |

### 重构方向：3 步拆分

把每轮对话拆成 3 步：

```
1. UnderstandTurn（理解意图）
   ├─ LLM/规则共同解析"这句话是什么意图"
   ├─ 输出: intent + confidence + evidence
   └─ 意图类型: available_to_talk / end_requested / identity_question / confirmed_task / smalltalk_reply

2. DecideNextAction（决策下一步）
   ├─ LLM 给出建议阶段和动作
   ├─ 状态机只做安全校验（硬上限 / 身份锁定 / 任务核心目标）
   └─ 输出: finalStage + finalAction

3. GenerateReply（生成话术）
   ├─ LLM 根据最终 action 生成自然话术
   └─ 输出: assistant_text
```

---

## 架构设计

### 重构后的流程

```
长辈输入 (elderUtterance)
    │
    ▼
┌─────────────────────────────────────┐
│ Step 1: UnderstandTurn               │
│ ├─ LLM 意图分类                      │
│ └─ 输出: intent + confidence + evidence │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Step 2: DecideNextAction            │
│ ├─ LLM 提议 nextStage + action       │
│ ├─ 状态机安全校验                    │
│ │   ├─ 硬上限检查（4分钟/12轮/拒绝）  │
│ │   ├─ 身份锁定检查                  │
│ │   └─ 任务核心目标检查              │
│ └─ 输出: finalStage + finalAction    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Step 3: GenerateReply               │
│ ├─ LLM 根据 finalAction 生成话术    │
│ └─ 输出: assistant_text              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 状态机推进阶段 + 持久化 CallSession  │
└─────────────────────────────────────┘
```

---

## 数据结构设计

### TurnIntentSchema（意图识别）

```typescript
export const TurnIntentSchema = z.object({
  // --- 核心意图 ---
  intent: z.enum([
    "available_to_talk",      // "方便" / "现在有空" / "可以聊"
    "end_requested",          // "不方便" / "现在忙" / "不想聊"
    "identity_question",      // "你是谁" / "谁设置的"
    "confirmed_task",         // "吃了" / "知道了" / "我会的"
    "smalltalk_reply",        // 日常寒暄回复（"今天天气不错"）
    "emotional_sharing",      // 情绪表达（"想你们了" / "有点孤单"）
    "task_response",          // 任务相关回复（"血压130" / "没吃药"）
    "relay_message",          // 带话（"跟小雨说我没事"）
    "unknown",
  ]),

  // --- 信心度与证据 ---
  confidence: z.number().min(0).max(1).default(0.8),
  evidence: z.string().default(""),

  // --- 额外字段 ---
  negation_detected: z.boolean().default(false),  // 检测到否定词（"不"、"没"）
  emotion_detected: z.boolean().default(false),   // 检测到情绪关键词
  length_category: z.enum(["short", "medium", "long"]).default("medium"),
});
```

### ActionDecisionSchema（LLM 提议）

```typescript
export const ActionDecisionSchema = z.object({
  // --- LLM 提议的下一阶段 ---
  proposed_stage: z.enum([
    "identity_and_consent",
    "warm_greeting",
    "child_update",
    "open_care_question",
    "listen_and_reflect",
    "task_reminder",
    "confirm_task",
    "ask_relay_message",
    "closing",
  ]),

  // --- LLM 提议的动作 ---
  proposed_action: z.enum([
    "greet",                     // 问候
    "ask_health_question",       // 问健康问题
    "deliver_update",            // 转达子女近况
    "remind_task",               // 提醒任务
    "confirm_task",              // 确认任务
    "ask_relay",                 // 询问带话
    "listen_and_reflect",        // 倾听回应
    "close_call",                // 结束通话
  ]),

  // --- 理由 ---
  reason: z.string(),

  // --- 是否 LLM 认为应该结束通话 ---
  should_end_call: z.boolean().default(false),
});
```

### FinalDecisionSchema（状态机校验后）

```typescript
export const FinalDecisionSchema = z.object({
  // --- 最终决定的阶段 ---
  final_stage: z.enum([
    "identity_and_consent",
    "warm_greeting",
    "child_update",
    "open_care_question",
    "listen_and_reflect",
    "task_reminder",
    "confirm_task",
    "ask_relay_message",
    "closing",
  ]),

  // --- 最终动作 ---
  final_action: z.enum([
    "greet",
    "ask_health_question",
    "deliver_update",
    "remind_task",
    "confirm_task",
    "ask_relay",
    "listen_and_reflect",
    "close_call",
  ]),

  // --- 校验结果 ---
  validation_result: z.object({
    passed: z.boolean(),
    hard_limit_hit: z.boolean(),        // 是否触发硬上限
    identity_check_passed: z.boolean(), // 身份锁定检查
    task_core_achieved: z.boolean(),    // 任务核心目标是否达成
    override_reason: z.string(),        // 如果状态机覆盖了 LLM 提议，说明原因
  }),

  // --- 是否结束通话 ---
  should_end_call: z.boolean().default(false),
});
```

---

## 状态机安全校验规则

### 硬上限检查（不可覆盖）

| 条件 | 阈值 | 处理 |
|------|------|------|
| 长辈明确拒绝 | `elderWillingness=refused` | 强制结束，覆盖 LLM 提议 |
| 超时 | `elapsedSeconds > 240`（4分钟） | 强制结束，覆盖 LLM 提议 |
| 超轮次 | `turnCount > 12` | 强制结束，覆盖 LLM 提议 |

### 身份锁定检查（不可覆盖）

| 检查项 | 说明 |
|--------|------|
| session 创建时锁定 | 当前接电话的人是谁、称呼什么、谁设置的电话、任务属于谁 |
| "你"指代确定 | 所有 prompt 明确说明：长辈对面的"你" = 念念；子女接收的"你" = 念念 |
| 三方角色不混 | caregiver、elder、assistant 三个角色在上下文中明确分离 |

### 任务核心目标检查（可覆盖）

| 任务类型 | 核心目标 | 校验规则 |
|---------|---------|---------|
| medication | 药物是否服用 | LLM 可以决定"今天药没吃"但仍继续聊天 |
| health_measurement | 指标是否测量 | LLM 可以决定"没测"但仍继续聊天 |
| bring_items | 物品是否拿到 | LLM 可以决定"没拿"但仍继续聊天 |

**注意**：任务核心目标未达成，状态机可以**建议**但不强制覆盖 LLM 提议。LLM 可以决定继续聊天再问一次，或温柔收尾。

---

## 关键修复点

### 1. 修复"方便"被当成"不方便"

**问题**：当前 `nextStage()` 硬编码规则，不区分"方便"和"不方便"。

**修复**：
```typescript
// src/lib/cognitive/turn-intent-classifier.ts
// 意图识别必须先检测否定词
const negationKeywords = ["不", "没", "别", "无需", "不用"];
const negationDetected = negationKeywords.some(kw => elderUtterance.includes(kw));

if (elderUtterance.includes("方便") && !negationDetected) {
  return { intent: "available_to_talk", confidence: 0.9 };
} else if (elderUtterance.includes("方便") && negationDetected) {
  return { intent: "end_requested", confidence: 0.9, evidence: "检测到否定词 + '方便'" };
} else if (elderUtterance.includes("不方便")) {
  return { intent: "end_requested", confidence: 0.9 };
}
```

### 2. 修复 listen_and_reflect 粘滞状态

**问题**：状态卡在 `listen_and_reflect`，最多 1 轮后必须回到主流程。

**修复**：
```typescript
// src/lib/services/conversation-state-machine.ts
// listen_and_reflect 最多停留 1 轮
const LISTEN_AND_REFLECT_MAX_TURNS = 1;

export function validateNextStage(
  proposedStage: string,
  currentState: ConversationState
): { valid: boolean; overrideReason?: string } {
  // 如果 LLM 提议停留在 listen_and_reflect
  if (proposedStage === "listen_and_reflect") {
    // 检查是否已停留 1 轮
    const listenAndReflectTurns = currentState.completedStages.filter(
      s => s === "listen_and_reflect"
    ).length;

    if (listenAndReflectTurns >= LISTEN_AND_REFLECT_MAX_TURNS) {
      return {
        valid: false,
        overrideReason: "listen_and_reflect 已停留 1 轮，必须回到主流程（task_reminder）"
      };
    }
  }

  return { valid: true };
}
```

### 3. 修复寒暄阶段机械模板回复

**问题**：寒暄回复"我记住了，我在听"太机械。

**修复**：
```typescript
// src/lib/prompts/generate-reply.prompt.ts
// 寒暄回复必须先回应内容，再自然过渡
export function buildGenerateReplyPrompt(params: {
  currentStage: string;
  elderUtterance: string;
  finalAction: string;
  familyContext: string;
}): string {
  return `你是念念，一个温柔、有分寸的亲情关怀助理。

当前阶段：${params.currentStage}
长辈这句话：${params.elderUtterance}
你的动作：${params.finalAction}

## 寒暄回复规范
- **必须先回应长辈说过的内容**（如"那挺好呀"、"难怪呢"）
- **再自然过渡到下一步**（如"我也顺便提醒您一下，今天的药吃过了吗？"）
- **禁止说"我记住了，我在听"这种机械模板**
- 每句话尽量不超过 30 个字
- 多用语气词：呀、呢、嘛、啦、哦、~

## 示例
长辈："今天天气还不错呢"
正确回复："那挺好呀~我也顺便提醒您一下，今天的药吃过了吗？"
错误回复："好的，我都记下来了。阿姨还有其他要跟我说的吗？"

输出你的一句自然话术（30-100字）。`;
}
```

---

## 完整日志系统

### 日志结构

```typescript
export interface TurnLogEntry {
  timestamp: number;

  // 输入
  rawASR: string;              // ASR 原始文本
  normalizedText: string;      // 归一化后文本（去标点、空格等）

  // 状态
  stageBefore: string;         // 当前阶段
  turnCount: number;           // 轮次数

  // Step 1: UnderstandTurn
  intent: string;              // 意图类型
  intentConfidence: number;    // 信心度
  intentEvidence: string;      // 证据

  // Step 2: DecideNextAction
  proposedStage: string;       // LLM 提议的阶段
  proposedAction: string;      // LLM 提议的动作
  stageAfter: string;          // 最终决定的阶段（状态机校验后）

  // Step 3: GenerateReply
  assistantReply: string;      // 助手回复
  replySource: string;         // 回复来源（llm/fallback/template）

  // 结束条件
  endReason?: string;          // 结束原因（如果有）
}

export function createTurnLog(
  elderUtterance: string,
  currentState: ConversationState,
  intentOutput: TurnIntentOutput,
  decisionOutput: FinalDecisionOutput,
  replyText: string,
  replySource: string
): TurnLogEntry {
  return {
    timestamp: Date.now(),
    rawASR: elderUtterance,
    normalizedText: elderUtterance.trim().replace(/\s+/g, ""),
    stageBefore: currentState.stage,
    turnCount: currentState.turnCount,
    intent: intentOutput.intent,
    intentConfidence: intentOutput.confidence,
    intentEvidence: intentOutput.evidence,
    proposedStage: decisionOutput.proposed_stage,
    proposedAction: decisionOutput.proposed_action,
    stageAfter: decisionOutput.final_stage,
    assistantReply: replyText,
    replySource: replySource,
    endReason: decisionOutput.should_end_call ? decisionOutput.validation_result.override_reason : undefined,
  };
}
```

### 日志存储

```typescript
// src/lib/services/turn-logger.service.ts
export class TurnLogger {
  private logs: Map<string, TurnLogEntry[]> = new Map();

  log(sessionId: string, entry: TurnLogEntry): void {
    if (!this.logs.has(sessionId)) {
      this.logs.set(sessionId, []);
    }
    this.logs.get(sessionId)!.push(entry);
  }

  getLogs(sessionId: string): TurnLogEntry[] {
    return this.logs.get(sessionId) || [];
  }

  exportLogs(sessionId: string): string {
    const logs = this.getLogs(sessionId);
    return JSON.stringify(logs, null, 2);
  }
}
```

---

## 实现计划

### Phase 1: 意图识别层

1. 创建 `src/lib/schemas/turn-intent.schema.ts` — 意图识别 Schema
2. 创建 `src/lib/cognitive/turn-intent-classifier.ts` — 意图分类器（LLM）
3. 修复"方便" vs "不方便" 的区分（先检测否定词）
4. 单元测试：覆盖各种意图类型 + 边界场景

### Phase 2: 决策层

1. 创建 `src/lib/schemas/action-decision.schema.ts` — LLM 提议 Schema
2. 创建 `src/lib/schemas/final-decision.schema.ts` — 最终决策 Schema
3. 重构 `src/lib/services/conversation-state-machine.ts`：
   - 新增 `validateNextStage()` 函数（安全校验）
   - 修复 `listen_and_reflect` 粘滞状态（最多 1 轮）
4. 新增 `src/lib/cognitive/action-decider.ts` — LLM 提议 + 状态机校验

### Phase 3: 话术生成层

1. 创建 `src/lib/prompts/generate-reply.prompt.ts` — 话术生成 Prompt
2. 重构 `src/lib/cognitive/call-turn-engine.ts`：
   - 去掉 `next.stage` 决定（由 DecideNextAction 层负责）
   - 只保留话术生成 + 观察
3. 修复寒暄阶段机械模板回复

### Phase 4: 日志系统

1. 创建 `src/lib/schemas/turn-log.schema.ts` — 日志 Schema
2. 创建 `src/lib/services/turn-logger.service.ts` — 日志服务
3. 集成到 `src/lib/workflows/call.workflow.ts` 的 `processTurn()` 中

### Phase 5: 身份锁定

1. 修复 `src/lib/services/call-session.service.ts`：
   - session 创建时锁定 `caregiver / elder / assistant` 三方角色
   - 在 context 中明确说明："你" = 念念
2. 更新所有 prompt，明确三方角色

### Phase 6: 测试验证

1. 回归测试：覆盖之前的问题场景
2. 表驱动测试：ASR 口语变体、复合句、单字昵称等
3. 日志分析：验证意图识别准确率、状态流转合理性

---

## 验证指标

| 指标 | 目标 | 当前 |
|------|------|------|
| "方便" 意图识别准确率 | 100% | ❌ 被误判为"不方便" |
| "身份问询"意图识别准确率 | 100% | ❌ 混淆 |
| listen_and_reflect 粘滞率 | 0%（最多 1 轮） | ❌ 反复说"我记住了，我在听" |
| 寒暄阶段回复自然度 | 主观评分 ≥ 8/10 | ❌ 机械模板 |
| 整体通话自然度 | 主观评分 ≥ 8/10 | 待验证 |

---

## 总结

**一句话**：把"意图识别 + 阶段推进 + 回复生成"解耦，让 LLM 参与决策，再用状态机兜底。

**核心理念**：
- **LLM 提议，状态机校验**（而不是状态机拍板，LLM 填空）
- **状态机只管安全和硬上限**（身份、4分钟/12轮、拒绝即停）
- **LLM 负责语义理解和自然对话**（意图识别、话术生成）

---

**文档版本**: 1.0  
**创建日期**: 2026-06-14  
**维护者**: 突然有点惦记你们项目组