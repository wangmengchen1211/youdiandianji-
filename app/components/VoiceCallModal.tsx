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
    // Prevent duplicate speak calls
    if (speakingRef.current) {
      return;
    }
    speakingRef.current = true;

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

    tts.speak({
      text,
      onEnd: () => {
        speakingRef.current = false;
        if (isCallEnding || pendingEndRef.current) {
          endCall();
        } else {
          setPhase("elder_listening");
          startListening();
        }
      },
      onError: () => {
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
      stt.stopListening();
      setPhase("ai_speaking");
      tts.speak({
        text: lastAssistant.text,
        onEnd: () => {
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

    setPhase("dialing"); // eslint-disable-line react-hooks/set-state-in-effect
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

    return () => {
      if (dialTimerRef.current) {
        clearTimeout(dialTimerRef.current);
        dialTimerRef.current = null;
      }
      if (speakDelayRef.current) {
        clearTimeout(speakDelayRef.current);
        speakDelayRef.current = null;
      }
    };
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[36px] bg-stone-950 p-4 text-white shadow-2xl">
        <div className="rounded-[28px] bg-[#1B1B1B] p-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-400">浏览器语音通话</p>
            <p className="font-mono text-sm text-orange-300">{formatTime(elapsedSeconds)}</p>
          </div>

          {/* Avatar + Name */}
          <div className="mt-4 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-400 text-3xl text-stone-900 shadow-lg shadow-orange-400/20">
              {elderName.charAt(0)}
            </div>
          </div>
          <p className="mt-3 text-center text-xl font-semibold">{elderName}</p>

          {/* Phase indicator */}
          <div className="mt-2 text-center text-sm text-stone-400">
            {phase === "connecting" && "正在接通中..."}
            {phase === "dialing" && "正在呼叫..."}
            {phase === "connected" && "通话已接通"}
            {phase === "ai_speaking" && "小助理正在说话..."}
            {phase === "elder_listening" && "现在可以说话了"}
            {phase === "processing" && "正在理解..."}
            {phase === "ending" && "正在结束通话..."}
            {phase === "ended" && "通话已结束"}
            {phase === "error" && "出现了一点问题"}
          </div>

          {/* Connecting spinner */}
          {phase === "connecting" && (
            <div className="mt-4 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-300/30 border-t-orange-300" />
            </div>
          )}

          {/* Waveform Animation */}
          {(phase === "ai_speaking" || phase === "dialing" || phase === "ending") && (
            <div className="mt-4 flex items-end justify-center gap-1.5">
              {[28, 18, 32, 14, 26, 20, 30, 16].map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-orange-300/80"
                  style={{
                    height: h,
                    animation: `waveform 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Mic Animation */}
          {phase === "elder_listening" && (
            <div className="mt-4 flex items-end justify-center gap-1.5">
              {[20, 28, 16, 30, 22, 26, 18, 24].map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-emerald-400/80"
                  style={{
                    height: h,
                    animation: stt.listening
                      ? `waveform 0.6s ease-in-out ${i * 0.08}s infinite alternate`
                      : "none",
                  }}
                />
              ))}
            </div>
          )}

          {/* Processing dots */}
          {phase === "processing" && (
            <div className="mt-4 flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-3 w-3 rounded-full bg-orange-300/60"
                  style={{
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Current AI Text (subtitle) */}
          {phase === "ai_speaking" && currentAiText && (
            <div className="mt-4 rounded-2xl bg-white/8 p-4">
              <p className="text-sm leading-7 text-stone-100">{currentAiText}</p>
            </div>
          )}

          {/* STT Subtitles */}
          {phase === "elder_listening" && (
            <div className="mt-4 rounded-2xl bg-white/8 p-4">
              {stt.finalTranscript ? (
                <p className="text-sm leading-7 text-emerald-200">{stt.finalTranscript}</p>
              ) : stt.interimTranscript ? (
                <p className="text-sm leading-7 text-stone-300 italic">
                  {stt.interimTranscript}
                </p>
              ) : (
                <p className="text-center text-sm text-stone-500">
                  {useTextInput ? "请在下方输入文字" : "请开始说话..."}
                </p>
              )}
            </div>
          )}

          {/* Transcript History (scrollable) */}
          {transcript.length > 1 &&
            (phase === "ai_speaking" ||
              phase === "elder_listening" ||
              phase === "processing") && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl bg-white/5 p-3">
                <div className="space-y-2">
                  {transcript.slice(-6).map((entry, i) => (
                    <p
                      key={i}
                      className={`text-xs leading-5 ${entry.role === "assistant" ? "text-orange-200/70" : "text-emerald-200/70"}`}
                    >
                      {entry.role === "assistant" ? "小助理" : elderName}：{entry.text}
                    </p>
                  ))}
                </div>
              </div>
            )}

          {/* Text input fallback */}
          {phase === "elder_listening" && useTextInput && (
            <div className="mt-3 flex gap-2">
              <input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTextInput();
                }}
                placeholder="输入长辈要说的话..."
                className="min-h-10 flex-1 rounded-2xl bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-stone-500"
              />
              <button
                type="button"
                onClick={submitTextInput}
                className="min-h-10 shrink-0 rounded-full bg-emerald-500 px-4 text-xs font-medium"
              >
                发送
              </button>
            </div>
          )}

          {/* STT Error */}
          {stt.error && phase !== "ended" && !useTextInput && (
            <div className="mt-3 rounded-2xl bg-rose-500/20 p-3 text-xs text-rose-200">
              <p>{stt.error}</p>
              <p className="mt-1 italic">已自动切换到文字输入模式</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 space-y-3">
            {/* Listening phase buttons */}
            {phase === "elder_listening" && (
              <div className="flex gap-2">
                {!useTextInput && (
                  <button
                    type="button"
                    onClick={() => {
                      stt.stopListening();
                      if (stt.finalTranscript.trim()) {
                        handleFinalTranscript(stt.finalTranscript.trim());
                      }
                    }}
                    className="min-h-11 flex-1 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium"
                  >
                    我说完了
                  </button>
                )}
                <button
                  type="button"
                  onClick={replayLastAssistant}
                  className="min-h-11 rounded-2xl bg-white/12 px-4 py-2 text-xs font-medium"
                >
                  重播上一句
                </button>
                {stt.supported && !useTextInput && (
                  <button
                    type="button"
                    onClick={() => setUseTextInput(true)}
                    className="min-h-11 rounded-2xl bg-white/12 px-4 py-2 text-xs font-medium"
                  >
                    文字输入
                  </button>
                )}
              </div>
            )}

            {/* Connecting - cancel */}
            {phase === "connecting" && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 w-full rounded-2xl bg-white/12 px-4 py-3 text-sm font-medium"
              >
                取消
              </button>
            )}

            {/* Dialing - cancel */}
            {phase === "dialing" && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 w-full rounded-2xl bg-white/12 px-4 py-3 text-sm font-medium"
              >
                取消
              </button>
            )}

            {/* Active call - hang up */}
            {(phase === "ai_speaking" ||
              phase === "elder_listening" ||
              phase === "processing") && (
              <button
                type="button"
                onClick={handleHangUp}
                className="min-h-12 w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-medium"
              >
                挂断
              </button>
            )}

            {/* Error state */}
            {phase === "error" && (
              <div className="space-y-2">
                <div className="rounded-2xl bg-rose-500/20 p-3 text-sm text-rose-200">
                  {errorMessage || "通话出现错误"}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 flex-1 rounded-2xl bg-white/12 px-4 py-2 text-sm font-medium"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}

            {/* Ended state */}
            {phase === "ended" && (
              <div className="space-y-3">
                {summary && (
                  <div className="rounded-2xl bg-white/8 p-4">
                    <p className="text-xs font-medium text-orange-300">通话摘要</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-200">
                      {summary.summary}
                    </p>
                    {summary.memoriesExtracted > 0 && (
                      <p className="mt-2 text-xs text-stone-400">
                        提取了 {summary.memoriesExtracted} 条记忆
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-12 w-full rounded-2xl bg-[#F2996E] px-4 py-3 text-sm font-medium text-white"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Waveform keyframes */}
      <style jsx>{`
        @keyframes waveform {
          0% {
            transform: scaleY(0.4);
          }
          100% {
            transform: scaleY(1);
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  );
}
