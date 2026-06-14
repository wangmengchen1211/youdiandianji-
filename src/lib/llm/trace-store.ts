// =====================================================================
// LLM Trace Store - 轻量级 LLM 调用追踪（内存存储）
// =====================================================================

export type LLMTrace = {
  id: number;
  agentName: string;
  inputSummary: string;
  outputSummary: string;
  schemaValid: boolean;
  schemaError?: string;
  latencyMs: number;
  usedFallback: boolean;
  fallbackReason?: string;
  tokenEstimate: { prompt: number; completion: number };
  timestamp: string;
};

const MAX_TRACES = 200;

class TraceStore {
  private traces: LLMTrace[] = [];
  private counter = 0;

  record(entry: Omit<LLMTrace, "id">): LLMTrace {
    const trace: LLMTrace = { id: ++this.counter, ...entry };
    this.traces.push(trace);
    if (this.traces.length > MAX_TRACES) {
      this.traces = this.traces.slice(-MAX_TRACES);
    }
    return trace;
  }

  getRecent(limit = 50): LLMTrace[] {
    return this.traces.slice(-limit).reverse();
  }

  getForAgent(agentName: string, limit = 20): LLMTrace[] {
    return this.traces
      .filter((t) => t.agentName === agentName)
      .slice(-limit)
      .reverse();
  }

  getStats(): {
    total: number;
    byAgent: Record<string, { count: number; avgLatencyMs: number; fallbackRate: number }>;
  } {
    const byAgent: Record<string, { count: number; totalLatency: number; fallbacks: number }> = {};
    for (const t of this.traces) {
      if (!byAgent[t.agentName]) byAgent[t.agentName] = { count: 0, totalLatency: 0, fallbacks: 0 };
      byAgent[t.agentName].count++;
      byAgent[t.agentName].totalLatency += t.latencyMs;
      if (t.usedFallback) byAgent[t.agentName].fallbacks++;
    }
    const result: Record<string, { count: number; avgLatencyMs: number; fallbackRate: number }> = {};
    for (const [name, stats] of Object.entries(byAgent)) {
      result[name] = {
        count: stats.count,
        avgLatencyMs: Math.round(stats.totalLatency / stats.count),
        fallbackRate: Math.round((stats.fallbacks / stats.count) * 100) / 100,
      };
    }
    return { total: this.traces.length, byAgent: result };
  }

  clear(): void {
    this.traces = [];
    this.counter = 0;
  }
}

// globalThis singleton to survive hot-reload
const globalForTrace = globalThis as unknown as { __dianjiTraceStore?: TraceStore };
export const traceStore: TraceStore =
  globalForTrace.__dianjiTraceStore ?? new TraceStore();
if (process.env.NODE_ENV !== "production") {
  globalForTrace.__dianjiTraceStore = traceStore;
}
