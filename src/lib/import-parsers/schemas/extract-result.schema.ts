import { z } from "zod";

/**
 * 记忆库子分类枚举。必须与 app/page.tsx 的 MemoryCategory 类型完全一致。
 * 17 个值，分三组主分类：
 *   - family_info: about_user, about_elder, elder_basic, elder_health, elder_habits, elder_contact, pending_review
 *   - relationship: relationship, rel_emotional, rel_history, rel_events, rel_preferences
 *   - chat_style:  communication_style, chat_language, chat_expression, chat_focus, chat_taboo
 */
export const MemoryCategorySchema = z.enum([
  "about_user",
  "about_elder",
  "relationship",
  "communication_style",
  "pending_review",
  "elder_basic",
  "elder_health",
  "elder_habits",
  "elder_contact",
  "rel_emotional",
  "rel_history",
  "rel_events",
  "rel_preferences",
  "chat_language",
  "chat_expression",
  "chat_focus",
  "chat_taboo",
]);

export type MemoryCategoryValue = z.infer<typeof MemoryCategorySchema>;

/**
 * 抽取出的单条候选事实。
 * - category: 17 选 1
 * - content:  事实表述（2-200 字，AI 抽取时已压缩）
 * - evidence: 引用原文 100 字内片段（供用户核查）
 * - confidence: 0-1，越高越可信
 */
export const CandidateSchema = z.object({
  category: MemoryCategorySchema,
  content: z.string().min(2).max(200),
  evidence: z.string().max(100),
  confidence: z.number().min(0).max(1),
});

export type Candidate = z.infer<typeof CandidateSchema>;

/**
 * LLM 抽取的整体输出。
 */
export const ExtractResultSchema = z.object({
  candidates: z.array(CandidateSchema),
});

export type ExtractResult = z.infer<typeof ExtractResultSchema>;

/**
 * 把抽取候选映射回主分类 tab。
 * 三个主分类（family_info / relationship / chat_style）来自 page.tsx 的 MEM_MAIN_TAB_CATS。
 */
export const MAIN_TAB_BY_CATEGORY: Record<MemoryCategoryValue, "family_info" | "relationship" | "chat_style"> = {
  about_user: "family_info",
  about_elder: "family_info",
  relationship: "relationship",
  communication_style: "chat_style",
  pending_review: "family_info",
  elder_basic: "family_info",
  elder_health: "family_info",
  elder_habits: "family_info",
  elder_contact: "family_info",
  rel_emotional: "relationship",
  rel_history: "relationship",
  rel_events: "relationship",
  rel_preferences: "relationship",
  chat_language: "chat_style",
  chat_expression: "chat_style",
  chat_focus: "chat_style",
  chat_taboo: "chat_style",
};

export const MAIN_TAB_LABEL: Record<"family_info" | "relationship" | "chat_style", string> = {
  family_info: "家人信息",
  relationship: "关系",
  chat_style: "聊天风格",
};

/**
 * 中文子分类标签（与 page.tsx 的 MEM_SUB_CATS label 一致）。
 */
export const SUB_CAT_LABEL: Record<MemoryCategoryValue, string> = {
  about_user: "关于家属",
  about_elder: "关于长辈",
  relationship: "关系",
  communication_style: "沟通风格",
  pending_review: "待复核",
  elder_basic: "基本信息",
  elder_health: "健康状况",
  elder_habits: "生活习惯",
  elder_contact: "联系方式",
  rel_emotional: "情感纽带",
  rel_history: "互动历史",
  rel_events: "重要事件",
  rel_preferences: "特殊偏好",
  chat_language: "语言习惯",
  chat_expression: "表达方式",
  chat_focus: "关注重点",
  chat_taboo: "沟通禁忌",
};
