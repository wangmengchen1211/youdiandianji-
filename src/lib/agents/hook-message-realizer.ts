/**
 * @deprecated v2 架构已替代此模块。
 * 替代模块: src/lib/workflows/hook.workflow.ts + src/lib/cognitive/hook-message-planner.ts
 * 状态: deprecated → 待 Task 10 删除
 */
import { callLLMTraced } from "../llm/llm-provider";
import { HOOK_MESSAGE_REALIZER_PROMPT } from "./prompts/hook-message-realizer.prompt";
import type { HookCandidate } from "../store/types";

/**
 * Hook Message Realizer - generates 30-100 character natural proactive messages.
 * Output is natural language text, not JSON.
 */
export async function realizeHookMessageText(
  candidate: HookCandidate
): Promise<string> {
  const userPrompt = JSON.stringify({
    hook_type: candidate.hookType,
    trigger_reason: candidate.triggerReason,
    message_goal: candidate.messageGoal,
    case_id: candidate.caseId,
    score: candidate.score,
  });

  try {
    const raw = await callLLMTraced(
      [
        { role: "system", content: HOOK_MESSAGE_REALIZER_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { agentName: "HookMessageRealizer", temperature: 0.5 }
    );

    const cleaned = raw.trim().replace(/^["']|["']$/g, "");
    // Enforce length
    if (cleaned.length > 100) return cleaned.slice(0, 100);
    if (cleaned.length < 10) return candidate.triggerReason + "。" + candidate.messageGoal;
    return cleaned;
  } catch {
    return `${candidate.triggerReason}。${candidate.messageGoal}。`;
  }
}
