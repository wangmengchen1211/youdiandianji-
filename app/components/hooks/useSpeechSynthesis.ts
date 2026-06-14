"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SpeakOptions = {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  /**
   * T0 修复：强制使用服务端 TTS。
   * true 时服务端失败会调 onError，不会静默 fallback 到浏览器 TTS。
   * 生产环境通话场景应设为 true。
   */
  forceServer?: boolean;
  /**
   * 接收服务端返回的 TTS provider（volcano / edge-tts / azure / browser）。
   * 用于上层记录到 console.log 供调试。
   */
  onProviderDetected?: (provider: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
};

type UseSpeechSynthesisReturn = {
  supported: boolean;
  speaking: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  speak: (options: SpeakOptions) => void;
  stop: () => void;
};

/**
 * 选择最佳中文语音，按质量优先级排序：
 * 1. Microsoft Online 神经网络语音（XiaoxiaoOnline > YunxiOnline > YunyangOnline）
 * 2. Microsoft 离线神经网络语音（Xiaoxiao > Yunxi > Yunyang）
 * 3. Google WaveNet / 标准中文语音
 * 4. 任意中文语音
 *
 * Windows Edge 浏览器自带高质量微软神经网络语音，效果接近 Azure TTS。
 * macOS 自带 Ting-Ting，质量中等。
 */
function pickChineseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Tier 1: Microsoft Online neural voices（最高质量，Windows Edge 可用）
  const onlineVoices = [
    "Microsoft Xiaoxiao Online",
    "Microsoft Yunxi Online",
    "Microsoft Yunyang Online",
    "Microsoft Xiaoyi Online",
    "Microsoft Yunjian Online",
  ];
  for (const name of onlineVoices) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }

  // Tier 2: Microsoft offline neural voices（高质量）
  const neuralVoices = [
    "Microsoft Xiaoxiao",
    "Microsoft Yunxi",
    "Microsoft Yunyang",
    "Microsoft Xiaoyi",
    "Microsoft Yunjian",
    "Microsoft Xiaochen",
    "Microsoft Xiaohan",
    "Microsoft Xiaomo",
  ];
  for (const name of neuralVoices) {
    const match = voices.find((v) => v.name.includes(name) && v.lang.startsWith("zh"));
    if (match) return match;
  }

  // Tier 3: Google 中文语音 / Apple Ting-Ting
  const thirdParty = [
    "Google 普通话（中国大陆）",
    "Google 普通话",
    "Google 國語",
    "Ting-Ting",
    "Mei-Jia",
    "Sinji",
  ];
  for (const name of thirdParty) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }

  // Tier 4: 任意 zh-CN 语音
  const zhCN = voices.find((v) => v.lang === "zh-CN");
  if (zhCN) return zhCN;

  // Tier 5: 任意中文语音
  const chinese = voices.find((v) => v.lang.startsWith("zh"));
  if (chinese) return chinese;

  return null;
}

/**
 * 将长文本拆分成适合 TTS 播放的小块。
 * Chrome 的 speechSynthesis 在单次播放超过 ~15秒时会截断，
 * 因此按标点符号拆分，每块不超过 ~80 个字符。
 */
function splitTextIntoChunks(text: string, maxLen = 80): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。！？；])/);

  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      const subParts = sentence.split(/(?<=[，、])/);
      for (const part of subParts) {
        if ((current + part).length > maxLen && current) {
          chunks.push(current);
          current = part;
        } else {
          current += part;
        }
      }
    } else {
      if ((current + sentence).length > maxLen && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current += sentence;
      }
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [supported, setSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!window.speechSynthesis;
  });
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // 分块播放状态
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const optionsRef = useRef<SpeakOptions | null>(null);
  const cancelledRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    function loadVoices() {
      const list = window.speechSynthesis.getVoices();
      if (list.length === 0) return;
      setVoices(list);
      setSelectedVoice(pickChineseVoice(list));
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    const retryTimer = setTimeout(loadVoices, 500);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      clearTimeout(retryTimer);
      window.speechSynthesis.cancel();
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  /**
   * Chrome bug 修复：speechSynthesis 在播放超过 ~15 秒后会静默暂停。
   * 定期 pause→resume 保持活跃。
   */
  function startKeepAlive() {
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }

  function stopKeepAlive() {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }

  /** 尝试使用服务端 TTS API 生成音频（带 5 秒超时保护） */
  async function tryServerTTS(options: SpeakOptions): Promise<boolean> {
    try {
      // 超时保护：5 秒内无响应则放弃服务端 TTS，快速回退浏览器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: options.text,
          lang: options.lang ?? "zh-CN",
          rate: options.rate ?? 0.9,
          pitch: options.pitch ?? 1.05,
          forceServer: options.forceServer === true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // T0 修复：503 且 forceServer=true → 不静默 fallback，让上层感知错误
        if (res.status === 503) {
          const errData = await res.json().catch(() => ({}));
          console.error(
            "[useSpeechSynthesis] 服务端 TTS 不可用（forceServer=true）：",
            errData.hint ?? errData.message ?? "Unknown error",
          );
        }
        return false;
      }

      const data = await res.json();

      // 记录 provider 到 console（供调试）
      if (data.provider) {
        options.onProviderDetected?.(data.provider);
      }

      // 如果服务端返回音频数据，使用 Audio 元素播放
      if (data.audio && data.format) {
        if (cancelledRef.current) return true;

        const audio = new Audio(`data:audio/${data.format};base64,${data.audio}`);
        audioRef.current = audio;
        audio.volume = options.volume ?? 0.85;
        audio.playbackRate = options.rate ?? 0.9;

        return new Promise<boolean>((resolve) => {
          audio.onplaying = () => {
            if (cancelledRef.current) {
              audio.pause();
              resolve(true);
              return;
            }
            options.onStart?.();
          };

          audio.onended = () => {
            audioRef.current = null;
            if (cancelledRef.current) {
              resolve(true);
              return;
            }
            setSpeaking(false);
            options.onEnd?.();
            resolve(true);
          };

          audio.onerror = () => {
            audioRef.current = null;
            resolve(false);
          };

          audio.play().catch(() => resolve(false));
        });
      }

      // 服务端未配置 TTS（返回 audio=null）→ 返回 false
      // 注意：forceServer=true 时 API 端会返回 503，不会走到这里
      return false;
    } catch {
      return false;
    }
  }

  /** 浏览器内置 TTS：分块顺序播放 */
  function playNextChunk() {
    if (cancelledRef.current) return;
    if (chunkIndexRef.current >= chunksRef.current.length) {
      setSpeaking(false);
      stopKeepAlive();
      optionsRef.current?.onEnd?.();
      return;
    }

    const chunk = chunksRef.current[chunkIndexRef.current];
    const utterance = new SpeechSynthesisUtterance(chunk);
    const opts = optionsRef.current!;
    utterance.lang = opts.lang ?? "zh-CN";
    utterance.rate = opts.rate ?? 0.9;
    utterance.pitch = opts.pitch ?? 1.05;
    utterance.volume = opts.volume ?? 0.85;

    const currentVoices = window.speechSynthesis.getVoices();
    const voice = selectedVoice ?? pickChineseVoice(currentVoices);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      if (chunkIndexRef.current === 0) {
        opts.onStart?.();
      }
    };

    utterance.onend = () => {
      if (cancelledRef.current) return;
      chunkIndexRef.current++;
      setTimeout(() => playNextChunk(), 50);
    };

    utterance.onerror = (event) => {
      if (cancelledRef.current) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      stopKeepAlive();
      setSpeaking(false);
      opts.onError?.(event);
    };

    window.speechSynthesis.speak(utterance);
  }

  /** 使用浏览器内置 TTS 播放（带分块） */
  function speakWithBrowser(options: SpeakOptions) {
    optionsRef.current = options;
    chunksRef.current = splitTextIntoChunks(options.text);
    chunkIndexRef.current = 0;

    setSpeaking(true);
    startKeepAlive();

    setTimeout(() => {
      if (cancelledRef.current) return;
      playNextChunk();
    }, 80);
  }

  const speak = useCallback(
    async (options: SpeakOptions) => {
      if (!supported) {
        options.onError?.(new Error("SpeechSynthesis not supported"));
        return;
      }

      // 取消任何正在播放的语音
      cancelledRef.current = true;
      window.speechSynthesis.cancel();
      stopKeepAlive();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // 重置状态
      cancelledRef.current = false;
      setSpeaking(true);

      // 优先尝试服务端 TTS API
      const serverSuccess = await tryServerTTS(options);

      if (!serverSuccess && !cancelledRef.current) {
        if (options.forceServer === true) {
          // T0 修复：forceServer=true 时不静默 fallback，直接报错
          console.error(
            "[useSpeechSynthesis] forceServer=true 但服务端 TTS 失败，不使用浏览器 fallback",
          );
          setSpeaking(false);
          options.onError?.(
            new Error(
              "服务端 TTS 不可用，且已禁用浏览器 fallback。请检查 VOLC_APPID / VOLC_ACCESS_TOKEN / edge-tts 配置。",
            ),
          );
          return;
        }
        // 回退到浏览器内置 TTS（带分块防截断）
        speakWithBrowser(options);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supported, selectedVoice],
  );

  const stop = useCallback(() => {
    cancelledRef.current = true;
    stopKeepAlive();
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  return { supported, speaking, voices, selectedVoice, speak, stop };
}
