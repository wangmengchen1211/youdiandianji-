// =====================================================================
// v2 Response Adapter — WorkflowResult → 旧前端 AgentResponse 适配层
// 保持前端 API 合约不变，v2 新增字段放入 meta
// =====================================================================
import type { WorkflowResult } from "../store/types";

// --- 旧前端 AgentResponse 类型（与 app/api/agent/route.ts 保持一致）---

export type AgentResponse = {
  kind: "text" | "taskDraft" | "note" | "summary" | "deepCare";
  content: string;
  drafts?: DraftPayload[];
  noteVersions?: NoteVersion[];
  openProfile?: boolean;
  relationHint?: string;
  deepCare?: {
    situation?: Record<string, unknown>;
    probes?: string[];
    caseUpdate?: Record<string, unknown>;
    suggestedActions?: string[];
  };
  /** v2 新增字段放在 meta 中 */
  meta?: Record<string, unknown>;
};

type DraftPayload = {
  title: string;
  type: string;
  elderId: string;
  elderDisplayName: string;
  content: string;
  remindLabel: string;
  repeatRule: string;
  channel: string;
  needConfirmation: boolean;
  needResult: boolean;
  priority: string;
};

type NoteVersion = {
  style: string;
  text: string;
};

/**
 * 将 v2 WorkflowResult 适配为旧前端 AgentResponse 格式。
 * 保证前端不会因为 v2 数据结构变化而崩溃。
 */
export function adaptWorkflowResultToAgentResponse(result: WorkflowResult): AgentResponse {
  switch (result.kind) {
    case "deep_care":
      return adaptDeepCare(result);
    case "task_draft":
      return adaptTaskDraft(result);
    case "text":
      return adaptText(result);
    case "call_turn":
      return adaptCallTurn(result);
    case "post_call":
      return adaptPostCall(result);
    case "error":
      return adaptError(result);
    default:
      return adaptText(result);
  }
}

/**
 * v2 workflow 抛错时的 fallback 响应
 */
export function buildFallbackResponse(error: unknown): AgentResponse {
  console.error("[response-adapter] v2 fallback:", error instanceof Error ? error.message : String(error));
  return {
    kind: "text",
    content: "哎呀，我刚才走神了一下~能再跟我说说嘛？",
    meta: { v2_fallback: true },
  };
}

// --- 适配子函数 ---

function adaptDeepCare(result: WorkflowResult): AgentResponse {
  const data = result.data ?? {};
  const situation = result.situationAnalysis ?? (data.situation as Record<string, unknown> | undefined);
  const caseUpdate = (data.case_update as Record<string, unknown>) ?? undefined;
  const suggestedActions = (data.suggested_actions as string[]) ?? [];

  return {
    kind: "deepCare",
    content: result.content,
    deepCare: {
      situation: situation ? { situationType: situation.situationType, riskLevel: situation.riskLevel } : undefined,
      probes: data.probes as string[] ?? (result.content ? [result.content] : []),
      caseUpdate,
      suggestedActions,
    },
    meta: {
      v2: true,
      safetyPolicy: result.safetyPolicy,
      ...result.meta,
    },
  };
}

function adaptTaskDraft(result: WorkflowResult): AgentResponse {
  const blueprint = (result.data?.task_blueprint as Record<string, unknown>) ?? {};

  // 将 TaskBlueprint 转换为旧 DraftPayload 格式
  const draft: DraftPayload = {
    title: (blueprint.title as string) ?? "提醒任务",
    type: mapTaskType(blueprint.task_type as string),
    elderId: (blueprint.elder_id as string) ?? "",
    elderDisplayName: (blueprint.elder_display_name as string) ?? "",
    content: (blueprint.content as string) ?? result.content,
    remindLabel: (blueprint.remind_label as string) ?? "",
    repeatRule: (blueprint.repeat_rule as string) ?? "none",
    channel: (blueprint.channel as string) ?? "电话提醒",
    needConfirmation: Boolean(blueprint.need_confirmation ?? true),
    needResult: Boolean(blueprint.need_result ?? true),
    priority: (blueprint.priority as string) ?? "normal",
  };

  return {
    kind: "taskDraft",
    content: result.content,
    drafts: [draft],
    meta: { v2: true, ...result.meta },
  };
}

function adaptText(result: WorkflowResult): AgentResponse {
  return {
    kind: "text",
    content: result.content || "能再说说你想做什么吗？",
    openProfile: Boolean(result.data?.open_profile),
    relationHint: result.data?.relation_hint as string | undefined,
    meta: { v2: true, ...result.meta },
  };
}

function adaptCallTurn(result: WorkflowResult): AgentResponse {
  // call_turn 不走 /api/agent，此适配仅做安全兜底
  return {
    kind: "text",
    content: result.content,
    meta: {
      v2: true,
      callData: result.data,
      observations: result.observations,
    },
  };
}

function adaptPostCall(result: WorkflowResult): AgentResponse {
  return {
    kind: "summary",
    content: result.content,
    meta: {
      v2: true,
      postData: result.data,
    },
  };
}

function adaptError(result: WorkflowResult): AgentResponse {
  return {
    kind: "text",
    content: result.content || "出了点小问题，稍后再试试呀~",
    meta: { v2: true, error: true },
  };
}

// --- 工具函数 ---

function mapTaskType(taskType: string): string {
  const mapping: Record<string, string> = {
    medication: "medication",
    health_measurement: "health_measurement",
    bring_items: "bring_items",
    call_back: "call_back",
    daily_care_call: "other",
  };
  return mapping[taskType] ?? "other";
}
