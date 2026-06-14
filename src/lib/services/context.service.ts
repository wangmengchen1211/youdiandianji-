// =====================================================================
// v2 Context Service — 合并 family-context-composer + relationship-context-composer
// 提供 forChat() / forCall() / forPostCall() / forHook()
// 纯数据组装，无 LLM 调用
// =====================================================================
import { composeFamilyContext } from "../agents/family-context-composer";
import { composeRelationshipContext } from "../agents/relationship-context-composer";
import type { FamilyContext, RelationshipContext } from "../store/types";

export type ContextBundle = {
  familyContext: FamilyContext;
  relationshipContext: RelationshipContext;
  /** 序列化为字符串，供 prompt 注入 */
  serialized: string;
};

function serializeContext(ctx: FamilyContext, relCtx: RelationshipContext): string {
  const parts: string[] = [];

  parts.push(`长辈: ${ctx.elder.displayName}（${ctx.elder.relation}）`);
  parts.push(`沟通风格: ${ctx.elder.communicationStyle}`);
  if (ctx.elder.healthContext.length > 0) {
    parts.push(`健康关注: ${ctx.elder.healthContext.join("、")}`);
  }

  parts.push(`子女: ${ctx.caregiver.displayName}`);
  if (ctx.caregiver.recentUpdates.length > 0) {
    parts.push(
      `子女近况: ${ctx.caregiver.recentUpdates.map((u) => u.content).join("；")}`
    );
  }

  if (ctx.recentCallSummaries.length > 0) {
    parts.push(`最近通话摘要: ${ctx.recentCallSummaries.join("；")}`);
  }
  if (ctx.recentCareInsights.length > 0) {
    parts.push(
      `最近洞察: ${ctx.recentCareInsights.map((i) => i.relationshipInsight).join("；")}`
    );
  }
  if (ctx.memories.length > 0) {
    parts.push(
      `长期记忆: ${ctx.memories.slice(0, 5).map((m) => `[${m.type}] ${m.content}`).join("；")}`
    );
  }
  if (ctx.openCareCases.length > 0) {
    parts.push(
      `未结案案例: ${ctx.openCareCases.map((c) => c.summary).join("；")}`
    );
  }
  if (ctx.pendingRelayMessages.length > 0) {
    parts.push(
      `待传话: ${ctx.pendingRelayMessages.map((m) => `${m.from}→${m.to}: ${m.content}`).join("；")}`
    );
  }

  // Relationship context additions
  if (relCtx.relationshipMemory.length > 0) {
    parts.push(`关系记忆: ${relCtx.relationshipMemory.join("；")}`);
  }
  if (relCtx.todayObjectives.length > 0) {
    parts.push(`今日任务目标: ${relCtx.todayObjectives.join("；")}`);
  }

  return parts.join("\n");
}

function buildBundle(
  elderId: string,
  caregiverId: string,
  taskObjectives: string[] = []
): ContextBundle {
  const familyContext = composeFamilyContext(elderId, caregiverId, taskObjectives);
  const relationshipContext = composeRelationshipContext(
    elderId,
    caregiverId,
    taskObjectives
  );
  return {
    familyContext,
    relationshipContext,
    serialized: serializeContext(familyContext, relationshipContext),
  };
}

/**
 * 子女端聊天上下文
 */
export function forChat(
  elderId: string,
  caregiverId: string
): ContextBundle {
  return buildBundle(elderId, caregiverId);
}

/**
 * 通话上下文
 */
export function forCall(
  elderId: string,
  caregiverId: string,
  taskObjectives: string[] = []
): ContextBundle {
  return buildBundle(elderId, caregiverId, taskObjectives);
}

/**
 * 通话后分析上下文
 */
export function forPostCall(
  elderId: string,
  caregiverId: string,
  taskObjectives: string[] = []
): ContextBundle {
  return buildBundle(elderId, caregiverId, taskObjectives);
}

/**
 * Hook 主动关怀上下文
 */
export function forHook(
  elderId: string,
  caregiverId: string
): ContextBundle {
  return buildBundle(elderId, caregiverId);
}
