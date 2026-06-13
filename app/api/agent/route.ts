import { NextResponse } from "next/server";

type TaskType =
  | "medication"
  | "health_measurement"
  | "bring_items"
  | "call_back"
  | "other";

type ElderContext = {
  id: string;
  relation: string;
  displayName: string;
  availableTime: string;
  communicationPreference: string[];
  nicknames: string[];
};

type TaskContext = {
  id: string;
  title: string;
  elderId: string;
  elderDisplayName: string;
  remindLabel: string;
  status: string;
};

type AssistantProfile = {
  tone: string;
  rhythm: string;
  initiative: string;
  signature: string;
};

type MemoryContext = {
  dateLabel: string;
  summary: string;
  childTranscript: string[];
  elderTranscript: string[];
};

type AgentRequest = {
  input: string;
  currentElderId: string | null;
  assistantProfile?: AssistantProfile;
  recentMemories?: MemoryContext[];
  elders: ElderContext[];
  tasks: TaskContext[];
};

type DraftPayload = {
  title: string;
  type: TaskType;
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

type AgentResponse = {
  kind: "text" | "taskDraft" | "note" | "summary";
  content: string;
  drafts?: DraftPayload[];
  noteVersions?: NoteVersion[];
  openProfile?: boolean;
  relationHint?: string;
};

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const systemPrompt = `
你是“突然有点惦记你们”的 Agent，只做四类事：
1. 创建提醒任务
2. 改写小纸条
3. 查询状态摘要
4. 引导添加长辈

产品规则：
- 产品核心是“提醒、触达、确认、表达”，不是医疗诊断。
- 不允许提供医疗建议、剂量建议、诊断判断。
- 对家属说话要温柔、简短、像家人，不要系统腔。
- assistantProfile 是当前小助理的说话风格，请尽量体现在 content、drafts.content 和 noteVersions.text 里。
- 电话只是提醒任务的一种触达方式，不要把“打电话”写成独立功能。
- 小助理要像家里人一样适度关心长辈，先问候、再提醒、最后留出回应空间，不要像机械交代任务。
- recentMemories 是助理记忆库里最近几天的聊天沉淀，请把它当作长期上下文，尽量延续之前的称呼、重点和关心方式。
- 如果用户输入不完整，要温和追问，最多追问一次。
- 若未指定长辈，优先使用 currentElderId 对应长辈；如果也没有，就追问提醒谁。
- 输出必须是严格 JSON，不要 Markdown，不要解释。

返回 JSON schema：
{
  "kind": "text" | "taskDraft" | "note" | "summary",
  "content": "给家属看的自然语言回复",
  "drafts": [
    {
      "title": "提醒爸爸测血糖",
      "type": "medication|health_measurement|bring_items|call_back|other",
      "elderId": "elder_xxx",
      "elderDisplayName": "爸爸",
      "content": "提醒爸爸测血糖，测完告诉我结果。",
      "remindLabel": "明早 08:00",
      "repeatRule": "none|daily",
      "channel": "电话提醒",
      "needConfirmation": true,
      "needResult": true,
      "priority": "normal"
    }
  ],
  "noteVersions": [
    { "style": "温柔型", "text": "..." },
    { "style": "轻松型", "text": "..." },
    { "style": "直接型", "text": "..." }
  ],
  "openProfile": false,
  "relationHint": "妈妈"
}

额外要求：
- kind 为 taskDraft 时必须提供 drafts。
- kind 为 note 时必须提供 3 个 noteVersions，内容 20-60 字，不责备、不命令。
- kind 为 summary 时只返回 content，不要 drafts。
- kind 为 text 可用于追问、失败提示或引导添加长辈。
- 如果用户想添加长辈，请返回 kind=text、openProfile=true，并尽量填 relationHint。
- drafts 里的 elderId 必须来自上下文 elders 列表。
- 如果无法确定 elderId，就不要瞎编，改成 kind=text 追问用户。
`.trim();

function sanitizeResponse(payload: Partial<AgentResponse>, elders: ElderContext[]): AgentResponse {
  const safeContent = typeof payload.content === "string" && payload.content.trim()
    ? payload.content.trim()
    : "我先帮你理一下，你可以再说具体一点。";

  if (payload.kind === "taskDraft" && Array.isArray(payload.drafts) && payload.drafts.length > 0) {
    const allowedIds = new Set(elders.map((elder) => elder.id));
    const drafts = payload.drafts.filter((draft) => allowedIds.has(draft.elderId)).map((draft) => ({
      title: draft.title,
      type: draft.type,
      elderId: draft.elderId,
      elderDisplayName: draft.elderDisplayName,
      content: draft.content,
      remindLabel: draft.remindLabel,
      repeatRule: draft.repeatRule || "none",
      channel: draft.channel || "电话提醒",
      needConfirmation: Boolean(draft.needConfirmation),
      needResult: Boolean(draft.needResult),
      priority: draft.priority || "normal",
    }));

    if (drafts.length > 0) {
      return { kind: "taskDraft", content: safeContent, drafts };
    }
  }

  if (payload.kind === "note" && Array.isArray(payload.noteVersions) && payload.noteVersions.length > 0) {
    const noteVersions = payload.noteVersions.slice(0, 3).map((item) => ({
      style: item.style || "版本",
      text: item.text || safeContent,
    }));
    return { kind: "note", content: safeContent, noteVersions };
  }

  if (payload.kind === "summary") {
    return { kind: "summary", content: safeContent };
  }

  return {
    kind: "text",
    content: safeContent,
    openProfile: Boolean(payload.openProfile),
    relationHint: payload.relationHint,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY 未配置。" },
      { status: 500 },
    );
  }

  let body: AgentRequest;

  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const userPrompt = JSON.stringify(
    {
      input: body.input,
      currentElderId: body.currentElderId,
      assistantProfile: body.assistantProfile,
      recentMemories: body.recentMemories ?? [],
      elders: body.elders,
      tasks: body.tasks,
    },
    null,
    2,
  );

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `DeepSeek 请求失败：${errorText}` },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json({ error: "模型没有返回内容。" }, { status: 502 });
    }

    const parsed = JSON.parse(rawContent) as Partial<AgentResponse>;
    const sanitized = sanitizeResponse(parsed, body.elders);
    return NextResponse.json(sanitized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
