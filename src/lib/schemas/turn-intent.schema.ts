// =====================================================================
// v2.1 Turn Intent Schema — 意图识别层
// 解析长辈这句话是什么意图，替代正则/substring 判断
// =====================================================================
import { z } from "zod";

/**
 * 9 种意图类型
 */
export const TurnIntentSchema = z.object({
  // --- 核心意图 ---
  intent: z.enum([
    "available_to_talk", // "方便" / "现在有空" / "可以聊"
    "end_requested", // "不方便" / "现在忙" / "不想聊"
    "identity_question", // "你是谁" / "谁设置的"
    "confirmed_task", // "吃了" / "知道了" / "我会的"
    "smalltalk_reply", // 日常寒暄回复
    "emotional_sharing", // 情绪表达（"想你们了" / "有点孤单"）
    "task_response", // 任务相关回复（"血压130" / "没吃药"）
    "relay_message", // 带话（"跟小雨说我没事"）
    "unknown",
  ]),

  // --- 信心度与证据 ---
  confidence: z.number().min(0).max(1).default(0.8),
  evidence: z.string().default(""),

  // --- 辅助字段（帮助状态机做决策）---
  negation_detected: z.boolean().default(false), // 检测到否定词（"不"、"没"）
  emotion_detected: z.boolean().default(false), // 检测到情绪关键词
  length_category: z.enum(["short", "medium", "long"]).default("medium"),

  // --- 分析补充 ---
  factual_info: z.record(z.string(), z.unknown()).default({}), // 提取的客观事实
  task_slots: z.record(z.string(), z.unknown()).default({}), // 任务槽位
  emotion_label: z.string().default("neutral"), // 情绪标签
});

export type TurnIntentOutput = z.infer<typeof TurnIntentSchema>;
