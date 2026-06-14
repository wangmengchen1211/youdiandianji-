"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Web Speech API type declarations (not in all TS lib definitions)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onaudioend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onnomatch: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

type UseSpeechRecognitionReturn = {
  supported: boolean;
  listening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
};

const SILENCE_TIMEOUT_MS = 1500;

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "麦克风权限被拒绝，请允许浏览器使用麦克风",
  "no-speech": "没听清，可以再说一遍",
  "audio-capture": "没有检测到麦克风",
  network: "语音识别服务不可用（网络问题），已自动切换到文字输入",
  aborted: "本轮识别已取消",
  "no-match": "没有识别到语音内容，请再说一遍",
};

function getRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(
  onFinalTranscript?: (text: string) => void,
): UseSpeechRecognitionReturn {
  const isSupported = getRecognitionConstructor() !== null;
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  const finalTextRef = useRef("");

  // Keep refs in sync without updating during render
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    const SpeechRecognition = getRecognitionConstructor();

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        const updated = (prev: string) => prev + final;
        setFinalTranscript(updated);
        finalTextRef.current += final;
        setInterimTranscript("");
        // Clear silence timer since we got a final result
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (interim) {
        setInterimTranscript(interim);
        // Reset silence timer on new interim content
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(() => {
          // Silence detected after speech - stop recognition
          recognition.stop();
        }, SILENCE_TIMEOUT_MS);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const msg = ERROR_MESSAGES[event.error] ?? `识别错误: ${event.error}`;
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(msg);
      }
      // For no-speech, just end cleanly without error
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      // Trigger callback with accumulated final text
      const text = finalTextRef.current.trim();
      if (text) {
        onFinalRef.current?.(text);
      }
    };

    recognition.onspeechstart = () => {
      // User started speaking - start silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };

    recognition.onspeechend = () => {
      // User stopped speaking - start silence timer
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop();
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onaudioend = () => {
      setListening(false);
    };

    recognition.onnomatch = () => {
      setError("没有识别到语音内容，请再说一遍");
    };

    return () => {
      recognition.abort();
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError(null);
    setFinalTranscript("");
    setInterimTranscript("");
    finalTextRef.current = "";
    try {
      recognition.start();
    } catch {
      // Already started - ignore
    }
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // Not running - ignore
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
    setError(null);
    finalTextRef.current = "";
  }, []);

  return {
    supported: isSupported,
    listening,
    interimTranscript,
    finalTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
