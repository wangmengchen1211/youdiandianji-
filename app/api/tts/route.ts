import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

/**
 * TTS API 端点
 *
 * 优先级（自动探测，无需手动配置）：
 * 1. MiniMax TTS（需 MINIMAX_API_KEY）— speech-2.8-turbo，专为长对话设计，语调最自然
 * 2. 火山引擎 TTS（需 VOLC_APPID + VOLC_ACCESS_TOKEN）— 豆包同款语音
 * 3. Azure TTS（需 AZURE_SPEECH_KEY）
 * 4. edge-tts（自动尝试，免费高质量神经网络语音）
 * 5. 浏览器 TTS（最终回退）
 *
 * 也可通过 TTS_PROVIDER 环境变量强制指定。
 *
 * 环境变量清单（按优先级倒序排列，按需在 .env.local 中配置）：
 *   MINIMAX_API_KEY    MiniMax TTS 密钥（首选）
 *   MINIMAX_VOICE      MiniMax 音色 ID，默认 male-qn-qingse
 *   MINIMAX_TTS_URL    MiniMax 代理 endpoint，默认 https://tokendance.space/gateway/minimax/v1/t2a_v2
 *   VOLC_APPID         火山引擎 AppID
 *   VOLC_ACCESS_TOKEN  火山引擎 Access Token
 *   VOLC_VOICE         火山引擎音色，默认 zh_female_wanxiang_moon_bigtts
 *   AZURE_SPEECH_KEY   Azure Speech Key
 *   AZURE_SPEECH_REGION Azure 区域，默认 eastasia
 *   TTS_PROVIDER       强制指定 provider（minimax/volcano/azure/edge-tts/browser）
 */

type TTSRequest = {
  text: string;
  lang?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  /**
   * T0 修复：强制使用服务端 TTS。
   * true 时跳过浏览器 fallback，最终失败返回 503（不静默回退）。
   * 仅生产环境使用，生产构建路径默认 true。
   */
  forceServer?: boolean;
};

// ── edge-tts ──────────────────────────────────────────────────────────

/** 检测系统是否安装了 edge-tts */
let edgeTTSAvailable: boolean | null = null;

async function checkEdgeTTS(): Promise<boolean> {
  if (edgeTTSAvailable !== null) return edgeTTSAvailable;
  try {
    await execFileAsync("python", ["-c", "import edge_tts; print('ok')"], {
      timeout: 5000,
      encoding: "utf-8",
    });
    edgeTTSAvailable = true;
  } catch {
    try {
      await execFileAsync("python3", ["-c", "import edge_tts; print('ok')"], {
        timeout: 5000,
        encoding: "utf-8",
      });
      edgeTTSAvailable = true;
    } catch {
      edgeTTSAvailable = false;
    }
  }
  return edgeTTSAvailable;
}

async function generateWithEdgeTTS(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
): Promise<{ audio: string; format: string } | null> {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  try {
    const ratePercent = Math.round((rate - 1) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    const pitchHz = Math.round((pitch - 1) * 50);
    const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;

    const args = [
      "-m", "edge_tts",
      "--text", text.slice(0, 3000),
      "--voice", voice,
      "--rate", rateStr,
      "--pitch", pitchStr,
      "--write-media", "-",
    ];

    const { stdout } = await execFileAsync(pythonCmd, args, {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15000,
    });

    if (stdout && stdout.length > 100) {
      return { audio: Buffer.from(stdout).toString("base64"), format: "mp3" };
    }
    return null;
  } catch (err) {
    console.warn("[TTS] edge-tts failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── MiniMax TTS（speech-2.8-turbo，专为长对话设计） ───────────────────

/**
 * MiniMax T2A v2 接口调用
 * - endpoint 默认走代理 https://tokendance.space/gateway/minimax/v1/t2a_v2
 * - 响应 data.audio 是 hex 编码的二进制音频，需转 base64 给前端 HTMLAudioElement 播放
 * - 错误检查：base_resp.status_code != 0
 */
async function generateWithMiniMaxTTS(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
): Promise<{ audio: string; format: string } | null> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return null;

  const url =
    process.env.MINIMAX_TTS_URL ?? "https://tokendance.space/gateway/minimax/v1/t2a_v2";
  const model = process.env.MINIMAX_MODEL ?? "minimax-speech-2.8-turbo";

  // 速率映射：我们的 rate (0.5–2.0) → MiniMax speed (0.5–2.0)，直接传递
  // 音调映射：我们的 pitch (0.5–2.0) → MiniMax pitch (-12–+12)：(pitch - 1) * 20
  const speed = Math.max(0.5, Math.min(2.0, rate));
  const mmPitch = Math.max(-12, Math.min(12, Math.round((pitch - 1) * 20)));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        text: text.slice(0, 3000),
        voice_setting: {
          voice_id: voice,
          speed,
          vol: 1,
          pitch: mmPitch,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[TTS] MiniMax HTTP error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as {
      data?: { audio?: string };
      extra_info?: { usage_characters?: number };
      base_resp?: { status_code?: number; message?: string };
    };

    // 错误检查
    if (data.base_resp?.status_code !== undefined && data.base_resp.status_code !== 0) {
      console.warn(
        `[TTS] MiniMax error: base_resp.status_code=${data.base_resp.status_code}, msg=${data.base_resp.message ?? "(none)"}`,
      );
      return null;
    }

    // 音频数据检查
    const audioHex = data.data?.audio;
    if (!audioHex || audioHex.length < 100) {
      console.warn(`[TTS] MiniMax empty audio (len=${audioHex?.length ?? 0})`);
      return null;
    }

    // hex → Buffer → base64（前端 HTMLAudioElement 用 base64 播放）
    const audioBuffer = Buffer.from(audioHex, "hex");
    if (audioBuffer.length < 100) {
      console.warn(`[TTS] MiniMax audio too short after hex decode: ${audioBuffer.length}`);
      return null;
    }

    const chars = data.extra_info?.usage_characters;
    if (chars !== undefined) {
      console.log(`[TTS] MiniMax OK, chars=${chars}, bytes=${audioBuffer.length}`);
    }
    return { audio: audioBuffer.toString("base64"), format: "mp3" };
  } catch (err) {
    console.warn("[TTS] MiniMax failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── 火山引擎 TTS（豆包同款） ──────────────────────────────────────────

async function generateWithVolcanoTTS(
  text: string,
  voice: string,
  rate: number,
): Promise<{ audio: string; format: string } | null> {
  const appId = process.env.VOLC_APPID;
  const accessToken = process.env.VOLC_ACCESS_TOKEN;
  if (!appId || !accessToken) return null;

  try {
    // 火山引擎 TTS API（WebSocket 改用 HTTP 接口）
    const url = "https://openspeech.bytedance.com/api/v1/tts";
    const timestamp = Math.floor(Date.now() / 1000);

    // 构造请求 JSON
    const reqJson = {
      app: {
        appid: appId,
        token: accessToken,
        cluster: process.env.VOLC_CLUSTER ?? "volcano_tts",
      },
      user: { uid: "nianian_agent" },
      audio: {
        voice_type: voice,
        encoding: "mp3",
        speed_ratio: rate,
        volume_ratio: 1.0,
        pitch_ratio: 1.0,
      },
      request: {
        reqid: crypto.randomUUID(),
        text: text.slice(0, 1024),
        text_type: "plain",
        operation: "query",
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer;${accessToken}`,
      },
      body: JSON.stringify(reqJson),
    });

    if (!res.ok) {
      console.warn("[TTS] Volcano TTS HTTP error:", res.status);
      return null;
    }

    const data = (await res.json()) as { code?: number; data?: string; message?: string };
    if (data.code === 3000 && data.data) {
      return { audio: data.data, format: "mp3" };
    }
    console.warn("[TTS] Volcano TTS error:", data.code, data.message);
    return null;
  } catch (err) {
    console.warn("[TTS] Volcano TTS failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Azure TTS ─────────────────────────────────────────────────────────

async function generateWithAzureTTS(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
  lang: string,
): Promise<{ audio: string; format: string } | null> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION ?? "eastasia";
  if (!speechKey) return null;

  const ssml = `<speak version='1.0' xml:lang='${lang}'>
    <voice name='${voice}'>
      <prosody rate='${Math.round((rate - 1) * 100)}%' pitch='${Math.round((pitch - 1) * 50)}%'>
        ${escapeXml(text)}
      </prosody>
    </voice>
  </speak>`.trim();

  const res = await fetch(
    `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    },
  );

  if (!res.ok) return null;

  const audioBuffer = await res.arrayBuffer();
  return { audio: Buffer.from(audioBuffer).toString("base64"), format: "mp3" };
}

// ── 主处理函数 ─────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TTSRequest;
    const { text, lang = "zh-CN", rate = 0.9, pitch = 1.05 } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    // 默认语音（温暖亲切的女声，适合小助理角色）
    const defaultVoice = body.voice ?? "zh-CN-XiaoxiaoNeural";

    // MiniMax 默认音色（speech-2.8-turbo 专用，年轻温柔女声，匹配“念念”人设）
    const minimaxVoice = process.env.MINIMAX_VOICE ?? "female-shaonv";

    // 火山引擎默认语音（豆包同款）
    const volcanoVoice = process.env.VOLC_VOICE ?? "zh_female_wanxiang_moon_bigtts";

    const forcedProvider = process.env.TTS_PROVIDER;

    // ── 强制指定 provider ──
    if (forcedProvider === "browser") {
      return NextResponse.json({
        audio: null, format: null, provider: "browser", text,
      });
    }

    // ── 1. MiniMax TTS（最优先：speech-2.8-turbo，专为长对话设计）──
    if (forcedProvider === "minimax" || (!forcedProvider && process.env.MINIMAX_API_KEY)) {
      const result = await generateWithMiniMaxTTS(text, minimaxVoice, rate, pitch);
      if (result) {
        return NextResponse.json({ ...result, provider: "minimax", voice: minimaxVoice });
      }
      // 失败则继续尝试其他 provider
    }

    if (forcedProvider === "volcano" || (!forcedProvider && process.env.VOLC_APPID)) {
      const result = await generateWithVolcanoTTS(text, volcanoVoice, rate);
      if (result) {
        return NextResponse.json({ ...result, provider: "volcano", voice: volcanoVoice });
      }
      // 失败则继续尝试其他 provider
    }

    if (forcedProvider === "azure" || (!forcedProvider && process.env.AZURE_SPEECH_KEY)) {
      const result = await generateWithAzureTTS(text, defaultVoice, rate, pitch, lang);
      if (result) {
        return NextResponse.json({ ...result, provider: "azure" });
      }
    }

    // ── 自动探测 edge-tts（免费，高质量）──
    if (forcedProvider === "edge-tts" || !forcedProvider) {
      const hasEdge = await checkEdgeTTS();
      if (hasEdge) {
        const result = await generateWithEdgeTTS(text, defaultVoice, rate, pitch);
        if (result) {
          return NextResponse.json({ ...result, provider: "edge-tts", voice: defaultVoice });
        }
      }
    }

    // ── 最终回退：浏览器 TTS 或 503（取决于 forceServer）──
    if (body.forceServer === true) {
      // T0 修复：强制服务端模式 → 不静默 fallback，直接 503 让前端上报明确错误
      const hint = [
        process.env.MINIMAX_API_KEY ? null : "MINIMAX_API_KEY 未配置",
        process.env.VOLC_APPID ? null : "VOLC_APPID 未配置",
        process.env.VOLC_ACCESS_TOKEN ? null : "VOLC_ACCESS_TOKEN 未配置",
        process.env.AZURE_SPEECH_KEY ? null : "AZURE_SPEECH_KEY 未配置",
      ]
        .filter(Boolean)
        .join("；");
      console.error("[TTS] forceServer=true 但服务端 TTS 全部不可用:", hint);
      return NextResponse.json(
        {
          error: "TTS_UNAVAILABLE",
          message: "服务端 TTS 不可用，且已禁用浏览器 fallback。",
          hint: hint
            ? `${hint}。或安装 edge-tts（pip install edge-tts）。`
            : "请安装 edge-tts（pip install edge-tts）或检查服务端 TTS 配置。",
          provider: null,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      audio: null,
      format: null,
      provider: "browser",
      message: "No server-side TTS available. Using browser Web Speech API.",
      text,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown TTS error" },
      { status: 500 },
    );
  }
}
