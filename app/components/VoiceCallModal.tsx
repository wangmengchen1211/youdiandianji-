"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

type CallPhase =
  | "idle"
  | "connecting"
  | "dialing"
  | "connected"
  | "ai_speaking"
  | "elder_listening"
  | "processing"
  | "ending"
  | "ended"
  | "error";

type TranscriptEntry = {
  role: "assistant" | "elder";
  text: string;
};

type CallSummary = {
  summary: string;
  memoriesExtracted: number;
  careInsightId: string;
};

type VoiceCallModalProps = {
  open: boolean;
  elderName: string;
  callSessionId: string | null;
  initialText: string;
  onClose: () => void;
  onEnd?: (summary: CallSummary) => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function VoiceCallModal({
  open,
  elderName,
  callSessionId,
  initialText,
  onClose,
  onEnd,
}: VoiceCallModalProps) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentAiText, setCurrentAiText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [textInput, setTextInput] = useState("");
  const [useTextInput, setUseTextInput] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingEndRef = useRef(false);
  const speakingRef = useRef(false);
  const callStartedRef = useRef(false);
  const dialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tts = useSpeechSynthesis();

  const handleFinalTranscript = useCallback(
    async (text: string) => {
      if (!text.trim() || !callSessionId) return;

      setPhase("processing");
      setTranscript((prev) => [...prev, { role: "elder", text }]);

      try {
        const res = await fetch(`/api/calls/${callSessionId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speaker: "elder", elder_input: text }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "通话处理失败");

        const assistantText = data.assistant_reply ?? "...";
        const isCallEnding = data.is_call_ending === true;

        setTranscript((prev) => [...prev, { role: "assistant", text: assistantText }]);

        if (isCallEnding) {
          pendingEndRef.current = true;
        }

        // Speak the assistant reply
        speakAssistant(assistantText, isCallEnding);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "未知错误");
        setPhase("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callSessionId],
  );

  const stt = useSpeechRecognition(handleFinalTranscript);

  // Detect if we should fall back to text input
  useEffect(() => {
    if (open && !stt.supported) {
      setUseTextInput(true); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [open, stt.supported]);

  // Auto-switch to text input on STT error
  useEffect(() => {
    if (stt.error && phase === "elder_listening" && !useTextInput) {
      setUseTextInput(true); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [stt.error, phase, useTextInput]);

  function speakAssistant(text: string, isCallEnding: boolean) {
    // 防止重复播放：如果正在播放，先取消旧请求
    if (speakingRef.current) {
      tts.stop();
      speakingRef.current = false;
    }
    speakingRef.current = true;

    // 清理上一次的超时定时器
    if (ttsTimeoutRef.current) {
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;
    }

    setCurrentAiText(text);

    if (!tts.supported) {
      // TTS not available - show text only
      speakingRef.current = false;
      if (isCallEnding) {
        setTimeout(() => endCall(), 800);
      } else {
        setPhase("elder_listening");
        startListening();
      }
      return;
    }

    setPhase(isCallEnding ? "ending" : "ai_speaking");
    stt.stopListening();

    // 安全网：如果 TTS 在 30 秒内没有触发 onEnd/onError，强制重置
    // （分块播放已解决 Chrome 15秒截断问题，30秒是极端情况的安全网）
    const estimatedDuration = Math.max(10000, Math.min(30000, text.length * 250));
    ttsTimeoutRef.current = setTimeout(() => {
      speakingRef.current = false;
      tts.stop();
      if (isCallEnding || pendingEndRef.current) {
        endCall();
      } else {
        setPhase("elder_listening");
        startListening();
      }
    }, estimatedDuration);

    tts.speak({
      text,
      // Vercel 环境下 MiniMax 代理不可达，允许回退浏览器 TTS
      forceServer: false,
      onProviderDetected: (ttsProvider) => {
        // T0 修复：记录 provider 供调试 + 让上层排查「是否真的走了服务端」
        console.log("[voice_call_turn]", {
          phase: "tts",
          elderInput: transcript[transcript.length - 1]?.text ?? "",
          assistantReply: text,
          ttsProvider,
          isCallEnding,
        });
      },
      onEnd: () => {
        if (ttsTimeoutRef.current) {
          clearTimeout(ttsTimeoutRef.current);
          ttsTimeoutRef.current = null;
        }
        speakingRef.current = false;
        if (isCallEnding || pendingEndRef.current) {
          endCall();
        } else {
          setPhase("elder_listening");
          startListening();
        }
      },
      onError: (err) => {
        // T0 修复：服务端 TTS 不可用时 console 报错（生产环境 console 必须能看到）
        console.error("[voice_call_turn] TTS 失败：", err);
        if (ttsTimeoutRef.current) {
          clearTimeout(ttsTimeoutRef.current);
          ttsTimeoutRef.current = null;
        }
        speakingRef.current = false;
        // TTS failed - continue with text display
        if (isCallEnding || pendingEndRef.current) {
          endCall();
        } else {
          setPhase("elder_listening");
          startListening();
        }
      },
    });
  }

  function startListening() {
    if (useTextInput || !stt.supported) {
      // Using text fallback - no STT
      return;
    }
    stt.resetTranscript();
    stt.startListening();
  }

  async function endCall() {
    setPhase("ended");
    tts.stop();
    stt.stopListening();
    stopTimer();

    if (callSessionId) {
      try {
        const res = await fetch(`/api/calls/${callSessionId}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) {
          const data = await res.json();
          const result: CallSummary = {
            summary: data.summary ?? "通话已结束",
            memoriesExtracted: data.memories_extracted ?? 0,
            careInsightId: data.care_insight_id ?? "",
          };
          setSummary(result);
          onEnd?.(result);
        }
      } catch {
        // Finalize failed - still show ended state
      }
    }
  }

  function handleHangUp() {
    pendingEndRef.current = false;
    if (ttsTimeoutRef.current) {
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;
    }
    tts.stop();
    stt.stopListening();
    endCall();
  }

  function submitTextInput() {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    handleFinalTranscript(text);
  }

  function replayLastAssistant() {
    const lastAssistant = [...transcript].reverse().find((t) => t.role === "assistant");
    if (lastAssistant && tts.supported) {
      // 清理旧定时器
      if (ttsTimeoutRef.current) {
        clearTimeout(ttsTimeoutRef.current);
        ttsTimeoutRef.current = null;
      }
      tts.stop();
      speakingRef.current = true;
      stt.stopListening();
      setPhase("ai_speaking");

      const estimatedDuration = Math.max(10000, Math.min(30000, lastAssistant.text.length * 250));
      ttsTimeoutRef.current = setTimeout(() => {
        speakingRef.current = false;
        setPhase("elder_listening");
        startListening();
      }, estimatedDuration);

      tts.speak({
        text: lastAssistant.text,
        onEnd: () => {
          if (ttsTimeoutRef.current) {
            clearTimeout(ttsTimeoutRef.current);
            ttsTimeoutRef.current = null;
          }
          speakingRef.current = false;
          setPhase("elder_listening");
          startListening();
        },
        onError: () => {
          if (ttsTimeoutRef.current) {
            clearTimeout(ttsTimeoutRef.current);
            ttsTimeoutRef.current = null;
          }
          speakingRef.current = false;
          setPhase("elder_listening");
          startListening();
        },
      });
    }
  }

  // Timer
  function startTimer() {
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // When modal opens, enter connecting state immediately
  useEffect(() => {
    if (open) {
      // Reset all state for a fresh call
      speakingRef.current = false;
      callStartedRef.current = false;
      pendingEndRef.current = false;
      setPhase(callSessionId && initialText ? "dialing" : "connecting"); // eslint-disable-line react-hooks/set-state-in-effect
      if (callSessionId && initialText) {
        setTranscript([{ role: "assistant", text: initialText }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When session data arrives (callSessionId transitions from null to a value), start dialing
  useEffect(() => {
    if (!open || !initialText || !callSessionId) return;
    if (callStartedRef.current) return;
    callStartedRef.current = true;

    setPhase("dialing");
    setTranscript([{ role: "assistant", text: initialText }]);
    pendingEndRef.current = false;
    speakingRef.current = false;

    // Dialing animation for 1.5s, then connect and speak
    dialTimerRef.current = setTimeout(() => {
      dialTimerRef.current = null;
      setPhase("connected");
      startTimer();
      // Small pause before AI starts speaking
      speakDelayRef.current = setTimeout(() => {
        speakDelayRef.current = null;
        speakAssistant(initialText, false);
      }, 400);
    }, 1500);

    // NOTE: 不在此处返回 cleanup — cleanup 会在重渲染时执行并清除定时器，
    // 导致 speakAssistant() 永远不会被调用。
    // 定时器清理已由下方 open=false 时的 close effect 统一处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText, callSessionId]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      tts.stop();
      stt.stopListening();
      stopTimer();
      if (dialTimerRef.current) {
        clearTimeout(dialTimerRef.current);
        dialTimerRef.current = null;
      }
      if (speakDelayRef.current) {
        clearTimeout(speakDelayRef.current);
        speakDelayRef.current = null;
      }
      if (ttsTimeoutRef.current) {
        clearTimeout(ttsTimeoutRef.current);
        ttsTimeoutRef.current = null;
      }
      speakingRef.current = false;
      callStartedRef.current = false;
      setPhase("idle"); // eslint-disable-line react-hooks/set-state-in-effect
      setTranscript([]);
      setCurrentAiText("");
      setElapsedSeconds(0);
      setErrorMessage("");
      setSummary(null);
      setTextInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#2a1a0f] via-[#1a1010] to-[#0d0808] text-white">
      {/* Animated gradient orbs for depth */}
      <div className="pointer-events-none absolute left-[-10%] top-[10%] h-72 w-72 rounded-full bg-[#F2996E]/15 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-[20%] right-[-5%] h-64 w-64 rounded-full bg-rose-500/10 blur-[90px]" />

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-[max(20px,env(safe-area-inset-top))]">
        <p className="text-[12px] text-white/40">语音通话</p>
        <p className="font-mono text-[13px] text-white/50">{formatTime(elapsedSeconds)}</p>
      </div>

      {/* Main content area - centered */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {/* Avatar with breathing ring */}
        <div className="relative flex items-center justify-center">
          {/* Breathing ring */}
          {(phase === "ai_speaking" || phase === "dialing" || phase === "connecting") && (
            <>
              <span className="absolute h-32 w-32 rounded-full bg-[#F2996E]/20" style={{ animation: "breathe 2s ease-out infinite" }} />
              <span className="absolute h-28 w-28 rounded-full bg-[#F2996E]/15" style={{ animation: "breathe 2s ease-out 0.3s infinite" }} />
            </>
          )}
          {/* Avatar - 使用小助理头像 */}
          <img
            src="/assistant-avatar.jpg"
            alt="小助理"
            className="relative h-24 w-24 rounded-full object-cover shadow-[0_8px_32px_rgba(242,153,110,0.3)]"
          />
        </div>

        {/* Name + status */}
        <p className="mt-5 text-[22px] font-semibold tracking-tight">小助理：念念</p>
        <div className="mt-1.5 h-5 text-[13px] text-white/50">
          {phase === "connecting" && `正在接通 ${elderName}...`}
          {phase === "dialing" && `正在呼叫 ${elderName}...`}
          {phase === "connected" && `正在和 ${elderName} 通话中`}
          {phase === "ai_speaking" && "小助理说话中"}
          {phase === "elder_listening" && "请说话"}
          {phase === "processing" && "理解中..."}
          {phase === "ending" && "结束中..."}
          {phase === "ended" && "通话已结束"}
          {phase === "error" && "出现问题"}
        </div>

        {/* Waveform - AI speaking */}
        {(phase === "ai_speaking" || phase === "dialing" || phase === "ending") && (
          <div className="mt-4 flex h-10 items-center justify-center gap-1">
            {[0.4, 0.7, 0.3, 0.9, 0.5, 0.8, 0.35, 0.6].map((ratio, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-[#F2996E]/70"
                style={{
                  height: `${ratio * 36}px`,
                  animation: `waveform 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}

        {/* Mic listening indicator */}
        {phase === "elder_listening" && (
          <div className="mt-4 flex h-10 items-center justify-center gap-1">
            {[0.3, 0.8, 0.5, 0.9, 0.4, 0.7, 0.6, 0.45].map((ratio, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-emerald-400/60"
                style={{
                  height: `${ratio * 32}px`,
                  animation: stt.listening
                    ? `waveform 0.5s ease-in-out ${i * 0.07}s infinite alternate`
                    : "none",
                }}
              />
            ))}
          </div>
        )}

        {/* Processing dots */}
        {phase === "processing" && (
          <div className="mt-4 flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-white/40"
                style={{ animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        )}

        {/* AI subtitle - glassmorphism card */}
        {phase === "ai_speaking" && currentAiText && (
          <div className="mt-5 w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
            <p className="text-[14px] leading-6 text-white/90">{currentAiText}</p>
          </div>
        )}

        {/* STT subtitle */}
        {phase === "elder_listening" && (
          <div className="mt-5 w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
            {stt.finalTranscript ? (
              <p className="text-[14px] leading-6 text-emerald-300/90">{stt.finalTranscript}</p>
            ) : stt.interimTranscript ? (
              <p className="text-[14px] leading-6 text-white/60 italic">{stt.interimTranscript}</p>
            ) : (
              <p className="text-center text-[13px] text-white/35">
                {useTextInput ? "在下方输入文字" : "说话时这里会显示文字..."}
              </p>
            )}
          </div>
        )}

        {/* Text input fallback */}
        {phase === "elder_listening" && useTextInput && (
          <div className="mt-3 flex w-full max-w-xs gap-2">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitTextInput(); }}
              placeholder="输入要说的话..."
              className="min-h-10 flex-1 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-[14px] text-white outline-none backdrop-blur-md placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={submitTextInput}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2996E] text-[12px] font-medium"
            >
              →
            </button>
          </div>
        )}

        {/* STT error hint */}
        {stt.error && phase !== "ended" && !useTextInput && (
          <div className="mt-3 w-full max-w-xs rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200/80 backdrop-blur-md">
            {stt.error} · 已切换文字输入
          </div>
        )}

        {/* Ended summary */}
        {phase === "ended" && summary && (
          <div className="mt-5 w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md">
            <p className="text-[11px] font-medium text-[#F2996E]/80">通话摘要</p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-white/70">{summary.summary}</p>
            {summary.memoriesExtracted > 0 && (
              <p className="mt-2 text-[11px] text-white/40">提取了 {summary.memoriesExtracted} 条记忆</p>
            )}
          </div>
        )}

        {/* Connecting spinner */}
        {phase === "connecting" && (
          <div className="mt-6 h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
        )}
      </div>

      {/* Bottom action area */}
      <div className="relative z-10 px-8 pb-[max(28px,env(safe-area-inset-bottom))] pt-4">
        {/* Ended / Error - single close button */}
        {(phase === "ended" || phase === "error") && (
          <button
            type="button"
            onClick={onClose}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/70">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Error message */}
        {phase === "error" && errorMessage && (
          <p className="mb-3 text-center text-[12px] text-rose-300/70">{errorMessage}</p>
        )}

        {/* Connecting / Dialing - cancel */}
        {(phase === "connecting" || phase === "dialing") && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/80 shadow-lg shadow-rose-500/20"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white rotate-[135deg]">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </button>
            <span className="text-[12px] text-white/40">取消</span>
          </div>
        )}

        {/* Active call - circular buttons like WeChat */}
        {(phase === "ai_speaking" || phase === "elder_listening" || phase === "processing" || phase === "ending") && (
          <div className="flex items-center justify-center gap-8">
            {/* Replay button */}
            {phase === "elder_listening" && (
              <button
                type="button"
                onClick={replayLastAssistant}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                    <path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1.06-6.7 2.82L3 8" />
                    <path d="M3 4v4h4" />
                  </svg>
                </div>
                <span className="text-[10px] text-white/40">重播</span>
              </button>
            )}

            {/* Done speaking button */}
            {phase === "elder_listening" && !useTextInput && (
              <button
                type="button"
                onClick={() => {
                  stt.stopListening();
                  if (stt.finalTranscript.trim()) {
                    handleFinalTranscript(stt.finalTranscript.trim());
                  }
                }}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/70">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <span className="text-[10px] text-white/40">说完了</span>
              </button>
            )}

            {/* Text input toggle */}
            {phase === "elder_listening" && stt.supported && !useTextInput && (
              <button
                type="button"
                onClick={() => setUseTextInput(true)}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] backdrop-blur-md">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                  </svg>
                </div>
                <span className="text-[10px] text-white/40">打字</span>
              </button>
            )}

            {/* Hang up - always visible during active call */}
            <button
              type="button"
              onClick={handleHangUp}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/30">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-white rotate-[135deg]">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
              </div>
              <span className="text-[10px] text-white/40">挂断</span>
            </button>
          </div>
        )}
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes waveform {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
        @keyframes breathe {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
