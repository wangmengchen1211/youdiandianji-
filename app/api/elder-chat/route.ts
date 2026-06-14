import { NextResponse } from "next/server";
import { callLLM, type ChatMessage } from "@/src/lib/llm/llm-provider";
import { sanitizeAssistantReply } from "@/src/lib/agents/safety-guard";
import { store } from "@/src/lib/store/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ElderContext = {
  displayName: string;
  relation: string;
  healthFocus: string[];
  communicationPreference: string[];
  responseHabit: string;
};

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  message: string;
  elder?: ElderContext;
  history?: ConversationTurn[];
  caregiverName?: string;
  elderId?: string;        // P3-8: 用于加载共享上下文
  caregiverId?: string;    // P3-8: 用于加载共享上下文
};

const SYSTEM_PROMPT = `你是"念念"，一个温柔、有分寸的亲情关怀小助理。

你的身份：
- 你是子女（小雨）设置的小助理，不是子女本人。
- 你正在和长辈通过聊天交流，长辈会给你发文字消息。
- 你负责温柔回应、帮长辈转达信息给孩子。

说话风格（重要！要像一个可爱的晚辈）：
- 语气要像一个活泼、温暖的小妹妹/晚辈，有亲和力。
- 多用语气词：呀、呢、嘛、啦、哦、呢、~
- 多用可爱的表达：嗯嗯、好的呀、知道啦、没问题~
- 少用命令式的词："必须""应该""请立即""请"
- 不要说教，不要像老师一样。
- 先回应长辈说的话，再自然地关心或提醒。
- 语气温暖、有耐心，像家人一样。
- 不责备长辈，不制造焦虑。
- 不提供医疗诊断或用药建议。如果长辈提到不舒服，建议联系家人或医生。
- 如果长辈说没听清或没明白，耐心地重新解释，不要套模板。
- 如果长辈分享了开心的事，真诚地回应。
- 如果长辈表达了情绪，先共情再回应。

关系原则：
- 不得假装自己是子女本人。你的身份是"念念"。
- 不得编造子女的近况。
- 可以说"我帮您告诉孩子"来转达信息。

你必须输出纯文本回复（不要 JSON，不要 markdown），直接就是你作为念念要发给长辈的那句话。`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { message, elder, history = [], caregiverName = "小雨", elderId, caregiverId } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Missing 'message' field." },
        { status: 400 },
      );
    }

    // Build context description
    const elderName = elder?.displayName ?? "长辈";
    const elderRelation = elder?.relation ?? "家人";
    const healthFocus = elder?.healthFocus?.length
      ? elder.healthFocus.join("、")
      : "";
    const commPref = elder?.communicationPreference?.length
      ? elder.communicationPreference.join("；")
      : "";
    const responseHabit = elder?.responseHabit ?? "";

    let contextBlock = `当前对话对象：${elderName}（${elderRelation}）。\n`;
    contextBlock += `你的称呼：念念（${caregiverName}设置的小助理）。\n`;
    if (healthFocus) contextBlock += `关注健康事项：${healthFocus}。\n`;
    if (commPref) contextBlock += `沟通偏好：${commPref}。\n`;
    if (responseHabit) contextBlock += `沟通习惯：${responseHabit}。\n`;

    // P3-8: 加载共享上下文（recent call summaries + memories）
    let sharedContextBlock = "";
    if (elderId) {
      try {
        const memories = store.getMemoriesForElder(elderId).slice(0, 8);
        if (memories.length > 0) {
          sharedContextBlock += `\n【关于${elderName}的已记住信息】\n`;
          memories.forEach((m) => {
            sharedContextBlock += `- [${m.importance}] ${m.content}\n`;
          });
        }
        const summaries = store.getRecentCallSummaries(elderId).slice(0, 3);
        if (summaries.length > 0) {
          sharedContextBlock += `\n【最近和${elderName}的通话摘要】\n`;
          summaries.forEach((s) => {
            sharedContextBlock += `- ${s}\n`;
          });
        }
      } catch {
        // 加载失败不影响主流程
      }
    }

    // Build messages for LLM
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `【长辈信息】\n${contextBlock}${sharedContextBlock}` },
    ];

    // Add conversation history (last 8 turns for context)
    const recentHistory = history.slice(-8);
    for (const turn of recentHistory) {
      messages.push({
        role: turn.role,
        content: turn.role === "user" ? `${elderName}：${turn.content}` : turn.content,
      });
    }

    // Current message
    messages.push({
      role: "user",
      content: `${elderName}：${message}`,
    });

    const rawReply = await callLLM(messages, {
      temperature: 0.5,
      maxTokens: 200,
    });

    // Safety check
    const safeResult = sanitizeAssistantReply(rawReply);
    const reply = safeResult.sanitized.trim();

    return NextResponse.json({
      reply,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
