// =====================================================================
// Feature Flag — v2 架构灰度开关
// =====================================================================

export type ChainKind = "chat" | "call" | "hook";

/**
 * 判断指定链路是否开启 v2。
 *
 * 优先级：
 * 1. AGENT_ARCH_VERSION=v2 → 全量开启（仅本地/测试）
 * 2. AGENT_ARCH_VERSION=v1 或未设置 → 按链路级开关判断
 * 3. 生产环境禁止使用全局 v2，必须用链路级开关灰度
 */
export function isV2Enabled(chain: ChainKind): boolean {
  // 全局开关（仅建议用于测试环境）
  if (process.env.AGENT_ARCH_VERSION === "v2") return true;

  // 链路级开关
  if (chain === "chat") return process.env.AGENT_V2_CHAT === "true";
  if (chain === "call") return process.env.AGENT_V2_CALL === "true";
  if (chain === "hook") return process.env.AGENT_V2_HOOK === "true";

  return false;
}

/**
 * v2 workflow 抛错时调用此函数，判断是否应该 fallback 到 v1。
 * 当前策略：总是 fallback（记录错误）。
 */
export function shouldFallbackToV1(error: unknown, chain: ChainKind): boolean {
  console.error(
    `[v2] ${chain} workflow error, falling back to v1:`,
    error instanceof Error ? error.message : String(error)
  );
  return true;
}
