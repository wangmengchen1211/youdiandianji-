// =====================================================================
// v2.1 Turn Logger — 完整日志系统（9 字段）
// 每轮记录 rawASR / normalizedText / stageBefore / intent / confidence
//   / evidence / stageAfter / replySource / endReason
// 用于调试和定位问题
// =====================================================================

export type TurnLogEntry = {
  timestamp: number;

  // --- 输入 ---
  rawASR: string;
  normalizedText: string;

  // --- 状态 ---
  stageBefore: string;
  turnCount: number;

  // --- Step 1: UnderstandTurn ---
  intent: string;
  intentConfidence: number;
  intentEvidence: string;
  negationDetected: boolean;
  emotionDetected: boolean;

  // --- Step 2: DecideNextAction ---
  proposedStage: string;
  proposedAction: string;
  stageAfter: string;
  validationPassed: boolean;
  overrideReason: string;
  hardLimitHit: boolean;

  // --- Step 3: GenerateReply ---
  assistantReply: string;
  replySource: string; // "llm" | "fallback"

  // --- 结束条件 ---
  endReason?: string;
};

export type SessionLogSummary = {
  sessionId: string;
  totalTurns: number;
  finalStage: string;
  endedByHardLimit: boolean;
  endReason: string;
  intentDistribution: Record<string, number>;
  replySourceDistribution: { llm: number; fallback: number };
  stageTransitionLog: { from: string; to: string; turn: number }[];
  turns: TurnLogEntry[];
};

class TurnLoggerImpl {
  private logs: Map<string, TurnLogEntry[]> = new Map();
  private stageTransitions: Map<string, { from: string; to: string; turn: number }[]> = new Map();

  /**
   * 记录一轮日志
   */
  log(sessionId: string, entry: TurnLogEntry): void {
    if (!this.logs.has(sessionId)) {
      this.logs.set(sessionId, []);
      this.stageTransitions.set(sessionId, []);
    }

    this.logs.get(sessionId)!.push(entry);
    this.stageTransitions.get(sessionId)!.push({
      from: entry.stageBefore,
      to: entry.stageAfter,
      turn: entry.turnCount,
    });

    // 同时 console.log 方便调试
    console.log(
      `[TurnLogger] session=${sessionId} turn=${entry.turnCount} ` +
        `stage=${entry.stageBefore}→${entry.stageAfter} ` +
        `intent=${entry.intent}(${entry.intentConfidence.toFixed(2)}) ` +
        `reply=${entry.replySource} ` +
        `${entry.endReason ? `END=${entry.endReason}` : ""}`
    );
  }

  /**
   * 获取某 session 的所有日志
   */
  getLogs(sessionId: string): TurnLogEntry[] {
    return this.logs.get(sessionId) || [];
  }

  /**
   * 导出某 session 的完整日志（JSON）
   */
  exportLogs(sessionId: string): string {
    const logs = this.getLogs(sessionId);
    return JSON.stringify(logs, null, 2);
  }

  /**
   * 生成 session 日志摘要
   */
  getSummary(sessionId: string): SessionLogSummary | null {
    const turns = this.logs.get(sessionId);
    const transitions = this.stageTransitions.get(sessionId);
    if (!turns || turns.length === 0) return null;

    const lastTurn = turns[turns.length - 1];

    // 意图分布
    const intentDistribution: Record<string, number> = {};
    for (const t of turns) {
      intentDistribution[t.intent] = (intentDistribution[t.intent] || 0) + 1;
    }

    // 回复来源分布
    const replySourceDistribution = { llm: 0, fallback: 0 };
    for (const t of turns) {
      if (t.replySource === "llm") replySourceDistribution.llm++;
      else replySourceDistribution.fallback++;
    }

    return {
      sessionId,
      totalTurns: turns.length,
      finalStage: lastTurn.stageAfter,
      endedByHardLimit: lastTurn.hardLimitHit,
      endReason: lastTurn.endReason ?? "通话正常结束",
      intentDistribution,
      replySourceDistribution,
      stageTransitionLog: transitions ?? [],
      turns,
    };
  }

  /**
   * 清除某 session 的日志
   */
  clear(sessionId: string): void {
    this.logs.delete(sessionId);
    this.stageTransitions.delete(sessionId);
  }
}

/**
 * 单例 TurnLogger
 */
export const turnLogger = new TurnLoggerImpl();
