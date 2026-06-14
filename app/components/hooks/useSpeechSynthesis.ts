"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SpeakOptions = {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
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

function pickChineseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const priorities = ["zh-CN", "zh-Hans", "zh"];
  for (const lang of priorities) {
    const match = voices.find((v) => v.lang === lang);
    if (match) return match;
  }
  // Fallback: any Chinese voice
  const chinese = voices.find((v) => v.lang.startsWith("zh"));
  if (chinese) return chinese;
  return null;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const onEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSupported(false);
      return;
    }
    setSupported(true);

    function loadVoices() {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
      setSelectedVoice(pickChineseVoice(list));
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (options: SpeakOptions) => {
      if (!supported) {
        options.onError?.(new Error("SpeechSynthesis not supported"));
        return;
      }

      // Cancel any pending speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(options.text);
      utterance.lang = options.lang ?? "zh-CN";
      // Softer, more natural speech for elderly care scenario
      utterance.rate = options.rate ?? 0.85; // Slightly slower
      utterance.pitch = options.pitch ?? 1.0; // Natural pitch
      utterance.volume = options.volume ?? 0.65; // Softer volume

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => {
        setSpeaking(true);
        options.onStart?.();
      };

      utterance.onend = () => {
        setSpeaking(false);
        onEndRef.current?.();
        options.onEnd?.();
      };

      utterance.onerror = (event) => {
        setSpeaking(false);
        options.onError?.(event);
      };

      onEndRef.current = options.onEnd ?? null;

      // Small delay to ensure cancel() has completed
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 50);
    },
    [supported, selectedVoice],
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { supported, speaking, voices, selectedVoice, speak, stop };
}
