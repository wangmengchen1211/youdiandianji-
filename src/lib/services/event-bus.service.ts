// =====================================================================
// v2 Event Bus Service — MVP 同步内存事件总线
// 每个事件必须写入 EventStore，不能只依赖内存回调
// =====================================================================
import { store } from "../store/memory-store";
import type { DomainEvent } from "../store/types";

// --- EventStore 接口 ---
export type EventStore = {
  append(event: DomainEvent): Promise<void>;
  listByType(type: DomainEvent["type"]): Promise<DomainEvent[]>;
  markHandled(eventId: string, handlerName: string): Promise<void>;
  markFailed(eventId: string, handlerName: string, error: string): Promise<void>;
};

// --- Handler 类型 ---
type EventHandler = (event: DomainEvent) => Promise<void>;

// --- 内存事件存储（MVP）---
const eventLog: DomainEvent[] = [];
const eventHandlers: Map<string, EventHandler[]> = new Map();
const handledMap: Map<string, { handlerName: string; handledAt: string; error?: string }[]> = new Map();

// --- EventStore 实现（基于内存，MVP 可替换为 DB）---
const eventStore: EventStore = {
  async append(event: DomainEvent): Promise<void> {
    eventLog.push(event);
  },

  async listByType(type: DomainEvent["type"]): Promise<DomainEvent[]> {
    return eventLog.filter((e) => e.type === type);
  },

  async markHandled(eventId: string, handlerName: string): Promise<void> {
    const existing = handledMap.get(eventId) ?? [];
    existing.push({ handlerName, handledAt: new Date().toISOString() });
    handledMap.set(eventId, existing);
  },

  async markFailed(eventId: string, handlerName: string, error: string): Promise<void> {
    const existing = handledMap.get(eventId) ?? [];
    existing.push({ handlerName, handledAt: new Date().toISOString(), error });
    handledMap.set(eventId, existing);
  },
};

/**
 * 注册事件处理器
 */
export function subscribe(eventType: string, handler: EventHandler): void {
  const handlers = eventHandlers.get(eventType) ?? [];
  handlers.push(handler);
  eventHandlers.set(eventType, handlers);
}

/**
 * 触发事件：先持久化，再分发给所有 handler
 * handler 失败记录错误但不影响主流程
 */
export async function emit(event: DomainEvent): Promise<void> {
  // 1. 持久化事件
  await eventStore.append(event);

  // 2. 分发给匹配的 handler
  const handlers = eventHandlers.get(event.type) ?? [];
  const wildcardHandlers = eventHandlers.get("*") ?? [];
  const allHandlers = [...handlers, ...wildcardHandlers];

  for (const handler of allHandlers) {
    try {
      await handler(event);
      await eventStore.markHandled(event.id, handler.name || "anonymous");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[EventBus] handler failed for ${event.type}:`, errorMsg);
      await eventStore.markFailed(event.id, handler.name || "anonymous", errorMsg);
    }
  }
}

/**
 * 按 idempotencyKey 检查事件是否已处理
 */
export function isDuplicate(idempotencyKey: string): boolean {
  return eventLog.some((e) => e.idempotencyKey === idempotencyKey);
}

/**
 * 创建 DomainEvent 的便捷函数
 */
export function createEvent(params: {
  type: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): DomainEvent {
  return {
    id: store.genId("evt"),
    type: params.type,
    idempotencyKey: params.idempotencyKey,
    payload: params.payload,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 获取 EventStore 引用（供高级用途）
 */
export function getEventStore(): EventStore {
  return eventStore;
}
