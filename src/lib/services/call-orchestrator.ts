import { store } from "../store/memory-store";
import type {
  CallSession,
  CallStage,
  ConversationState,
  TranscriptEntry,
  TaskResult,
} from "../store/types";
import { MockTelephonyProvider } from "../telephony/mock-telephony-provider";
import { composeRelationshipContext } from "../agents/relationship-context-composer";
import { composeFamilyContext } from "../agents/family-context-composer";
import { generateCallPlan } from "../agents/call-plan-generator";
import { generateConversationReply } from "../agents/relational-conversation";
import { extractResponseUnderstanding, extractPostCallSummary } from "../agents/response-understanding";
import { extractMemories } from "../agents/memory-curator";
import { generateCareInsight } from "../agents/care-insight-writer";
import { sanitizeAssistantReply, sanitizeCareInsight, checkSafety } from "../agents/safety-guard";
import { planTurn } from "../agents/turn-planner";
import {
  createInitialState,
  nextStage,
  shouldListenAndReflect,
  shouldEnterListenAndReflect,
  shouldEndCall,
  updateProbeBudget,
} from "./conversation-state-machine";
import { updateOccurrenceStatus } from "./task-occurrence-service";
import { getExistingMemoryContents } from "./memory-service";
import { saveCareInsight } from "./care-insight-service";
import { advanceNextRunAt } from "./task-template-service";

const telephony = new MockTelephonyProvider();

/**
 * Start a call for a task occurrence.
 * Creates CallSession, dials via TelephonyProvider, generates initial greeting.
 */
export async function startCall(taskOccurrenceId: string): Promise<{
  callSession: CallSession;
  initialReply: string;
}> {
  const occ = store.getTaskOccurrence(taskOccurrenceId);
  if (!occ) throw new Error(`TaskOccurrence ${taskOccurrenceId} not found`);

  const template = store.getTaskTemplate(occ.taskTemplateId);
  if (!template) throw new Error(`TaskTemplate ${occ.taskTemplateId} not found`);

  const elder = store.getElder(occ.elderId);
  if (!elder) throw new Error(`Elder ${occ.elderId} not found`);

  // Create call session
  const sessionId = store.genId("call");
  const session: CallSession = {
    id: sessionId,
    taskOccurrenceId,
    familyId: occ.familyId,
    elderId: occ.elderId,
    caregiverId: occ.caregiverId,
    phone: elder.phone,
    provider: "mock",
    status: "dialing",
    attemptNo: 1,
    conversationState: createInitialState(),
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.addCallSession(session);

  // Dial via telephony provider
  const callResult = await telephony.startCall({
    phone: elder.phone,
    elderId: occ.elderId,
    callSessionId: sessionId,
  });

  session.providerCallId = callResult.providerCallId;

  if (callResult.status !== "answered") {
    session.status = callResult.status === "no_answer" ? "no_answer" : "failed";
    store.updateCallSession(sessionId, { status: session.status, providerCallId: session.providerCallId });
    updateOccurrenceStatus(taskOccurrenceId, callResult.status === "no_answer" ? "no_answer" : "failed", undefined, sessionId);
    return { callSession: session, initialReply: "" };
  }

  // Connected - compose context and generate call plan
  session.status = "connected";
  session.startedAt = new Date().toISOString();
  session.answeredAt = new Date().toISOString();

  const objectives = [
    ...template.primaryObjectives.map((o) => o.content),
    ...template.relationshipObjectives.map((o) => o.content),
  ];

  const context = composeRelationshipContext(occ.elderId, occ.caregiverId, objectives);
  const callPlan = await generateCallPlan(context, sessionId);

  session.callPlan = callPlan;

  // Generate initial greeting (identity_and_consent stage)
  const reply = await generateConversationReply({
    context,
    callPlan,
    currentStage: "identity_and_consent",
    transcript: [],
    conversationState: session.conversationState,
  });

  // Safety check
  const safeReply = sanitizeAssistantReply(reply.assistantReply);
  const initialReply = safeReply.sanitized;

  // Add to transcript
  session.transcript.push({
    speaker: "assistant",
    text: initialReply,
    stage: "identity_and_consent",
    timestamp: new Date().toISOString(),
  });

  // Advance state
  session.conversationState.completedStages.push("identity_and_consent");
  session.conversationState.stage = nextStage(session.conversationState);
  session.conversationState.turnCount = 1;
  session.status = "in_progress";

  store.updateCallSession(sessionId, {
    status: session.status,
    startedAt: session.startedAt,
    answeredAt: session.answeredAt,
    callPlan: session.callPlan,
    transcript: session.transcript,
    conversationState: session.conversationState,
    providerCallId: session.providerCallId,
  });

  updateOccurrenceStatus(taskOccurrenceId, "answered", undefined, sessionId);

  return { callSession: session, initialReply };
}

/**
 * Process one turn of the conversation (refactored with TurnPlanner).
 * New flow:
 * 1. Load session + state + callPlan + familyContext
 * 2. Append elderText to transcript
 * 3. Call turnPlanner.planTurn() [merged: analysis + planning + generation]
 * 4. Validate with safetyGuard
 * 5. Merge state_patch into conversationState
 * 6. Enforce deterministic constraints
 * 7. Append assistantText to transcript
 * 8. Persist session
 * 9. Return enhanced response
 */
export async function processTurn(
  sessionId: string,
  elderInput: string
): Promise<{
  assistantReply: string;
  stage: CallStage;
  taskSlots: Record<string, unknown>;
  isCallEnding: boolean;
  probeBudget?: ConversationState["probeBudget"];
  emotion?: { label: string; confidence: number };
  relationshipSignals?: { type: string; content: string }[];
  statePatch?: Record<string, unknown>;
  safety?: { safe: boolean; repaired: boolean };
}> {
  const session = store.getCallSession(sessionId);
  if (!session) throw new Error(`CallSession ${sessionId} not found`);
  if (!session.callPlan) throw new Error(`CallSession ${sessionId} has no call plan`);

  const occ = store.getTaskOccurrence(session.taskOccurrenceId);
  const template = store.getTaskTemplate(occ?.taskTemplateId ?? "");

  // 1. Load family context
  const familyContext = composeFamilyContext(session.elderId, session.caregiverId);

  // 2. Append elder input to transcript
  session.transcript.push({
    speaker: "elder",
    text: elderInput,
    stage: session.conversationState.stage,
    timestamp: new Date().toISOString(),
  });

  // Update utterance tracking
  session.conversationState.lastElderUtterance = elderInput;

  // 3. Call TurnPlanner (merged: analysis + planning + generation)
  const turn = await planTurn(
    elderInput,
    session.callPlan,
    session.conversationState,
    familyContext,
    session.transcript
  );

  // 4. Validate with Safety Guard (two-layer check)
  const safetyResult = checkSafety(turn.next.assistantText);
  let assistantReply = turn.next.assistantText;
  let repaired = false;

  if (!safetyResult.safe && safetyResult.repairedReply) {
    assistantReply = safetyResult.repairedReply;
    repaired = true;
  }

  // 5. Merge state_patch into conversationState
  if (turn.statePatch.taskSlots) {
    session.conversationState.taskSlots = {
      ...session.conversationState.taskSlots,
      ...turn.statePatch.taskSlots,
    };
  }
  if (turn.statePatch.relationshipSlots) {
    session.conversationState.relationshipSlots = {
      ...session.conversationState.relationshipSlots,
      ...turn.statePatch.relationshipSlots,
    };
  }
  if (turn.statePatch.probeBudget) {
    updateProbeBudget(session.conversationState, turn.statePatch.probeBudget);
  }
  if (turn.statePatch.elderWillingness) {
    session.conversationState.elderWillingness = turn.statePatch.elderWillingness;
  }
  if (turn.statePatch.shouldCloseSoon !== undefined) {
    session.conversationState.shouldCloseSoon = turn.statePatch.shouldCloseSoon;
  }

  // Add risk signals from analysis
  if (turn.analysis.relationshipSignals.length > 0) {
    for (const sig of turn.analysis.relationshipSignals) {
      if (sig.confidence > 0.6) {
        session.conversationState.riskSignals.push({
          type: "emotional",
          content: sig.content,
          severity: sig.confidence > 0.8 ? "high" : "medium",
          shouldNotifyCaregiver: sig.confidence > 0.7,
        });
      }
    }
  }

  // 6. Enforce deterministic constraints
  let nextStg = turn.next.stage as CallStage;

  // Probe budget exhausted → no more probes, advance to closing
  if (session.conversationState.probeBudget.totalRemaining <= 0) {
    if (nextStg !== "closing" && nextStg !== "post_call_analysis") {
      // Don't force closing immediately, but flag should close
      session.conversationState.shouldCloseSoon = true;
    }
  }

  // Should end call?
  const isCallEnding = shouldEndCall(session.conversationState) || turn.next.isCallEnding;
  if (isCallEnding && nextStg !== "closing" && nextStg !== "post_call_analysis") {
    nextStg = "closing";
    // P1-1: 不要用硬编码模板覆盖 LLM 生成的收尾。
    // turn-planner 已经根据上下文生成自然的告别语，这里只做"如未生成才兜底"
    if (!assistantReply || assistantReply.trim().length === 0) {
      assistantReply = "好的，今天先聊到这里。您注意休息，有什么事随时跟家人说。我下次再给您打电话~";
    }
  }

  // Listen and reflect check
  if (session.conversationState.stage === "open_care_question" && shouldEnterListenAndReflect(elderInput)) {
    nextStg = "listen_and_reflect";
    session.conversationState.stage = "listen_and_reflect";
  }

  // Advance state
  const currentStage = session.conversationState.stage;
  if (turn.analysis.stageCompleted || nextStg !== currentStage) {
    if (!session.conversationState.completedStages.includes(currentStage)) {
      session.conversationState.completedStages.push(currentStage);
    }
  }
  session.conversationState.stage = nextStg;
  session.conversationState.turnCount += 1;
  session.conversationState.lastAssistantUtterance = assistantReply;

  // 7. Append assistant reply to transcript
  session.transcript.push({
    speaker: "assistant",
    text: assistantReply,
    stage: nextStg,
    timestamp: new Date().toISOString(),
  });

  // If closing, mark completed stages
  if (nextStg === "closing") {
    if (!session.conversationState.completedStages.includes("closing")) {
      session.conversationState.completedStages.push("closing");
    }
    session.conversationState.stage = "post_call_analysis";
  }

  // 8. Persist session
  store.updateCallSession(sessionId, {
    transcript: session.transcript,
    conversationState: session.conversationState,
  });

  // 9. Return enhanced response
  return {
    assistantReply,
    stage: nextStg,
    taskSlots: session.conversationState.taskSlots,
    isCallEnding: isCallEnding || nextStg === "closing" || nextStg === "post_call_analysis",
    probeBudget: session.conversationState.probeBudget,
    emotion: {
      label: turn.analysis.emotion.label,
      confidence: turn.analysis.emotion.confidence,
    },
    relationshipSignals: turn.analysis.relationshipSignals.map((s) => ({
      type: s.type,
      content: s.content,
    })),
    statePatch: turn.statePatch as Record<string, unknown>,
    safety: {
      safe: safetyResult.safe,
      repaired,
    },
  };
}

/**
 * Finalize a call session.
 * Runs post-call analysis: Memory Curator + Care Insight Writer.
 */
export async function finalizeCall(sessionId: string): Promise<{
  summary: string;
  memoriesExtracted: number;
  careInsightId: string;
}> {
  const session = store.getCallSession(sessionId);
  if (!session) throw new Error(`CallSession ${sessionId} not found`);

  const occ = store.getTaskOccurrence(session.taskOccurrenceId);
  const template = store.getTaskTemplate(occ?.taskTemplateId ?? "");
  const elder = store.getElder(session.elderId);
  const caregiver = store.getCaregiver(session.caregiverId);

  // End telephony call
  await telephony.endCall(sessionId);

  // Build summary
  const summary = session.transcript
    .map((t) => `${t.speaker === "assistant" ? "念念" : elder?.displayName ?? "长辈"}：${t.text}`)
    .join("\n");

  session.endedAt = new Date().toISOString();
  session.status = "ended";
  session.summary = summary;
  session.durationSeconds = session.startedAt
    ? Math.floor(
        (new Date(session.endedAt).getTime() -
          new Date(session.startedAt).getTime()) /
          1000
      )
    : 0;

  // Extract memories
  const existingMemories = getExistingMemoryContents(session.elderId);
  const memoryOutput = await extractMemories(session.transcript, existingMemories);

  let memoriesExtracted = 0;
  for (const mem of memoryOutput.newMemories) {
    const { addMemory } = await import("./memory-service");
    addMemory({
      elderId: session.elderId,
      caregiverId: session.caregiverId,
      memoryType: mem.type,
      content: mem.content,
      confidence: mem.confidence,
      importance: mem.importance,
      requiresReview: mem.requiresReview,
      sourceType: "call_session",
      sourceId: sessionId,
    });
    memoriesExtracted++;
  }

  // Post-call extraction: get structured summary from full transcript
  const postCallSummary = await extractPostCallSummary(
    session.transcript,
    template?.requiredSlots ?? []
  );

  // Build task result (combining TurnPlanner state + post-call extraction)
  const taskResult: TaskResult = {
    status: postCallSummary.taskStatus === "completed" || session.conversationState.taskSlots.medication_taken
      ? "completed"
      : "partially_completed",
    slots: { ...session.conversationState.taskSlots, ...postCallSummary.slots },
    riskSignals: [
      ...session.conversationState.riskSignals,
      ...postCallSummary.riskSignals,
    ],
    messageToChild: (session.conversationState.relationshipSlots.message_to_child as string)
      ?? postCallSummary.messageToChild
      ?? null,
    confidence: postCallSummary.confidence,
    needsReview: postCallSummary.needsReview || session.conversationState.riskSignals.length > 0,
  };

  // Generate care insight
  const childUpdateDelivered =
    session.transcript
      .filter((t) => t.stage === "child_update" && t.speaker === "assistant")
      .map((t) => t.text)
      .join(" ") || "未转达近况";

  const relProfile = store.getRelationshipProfile(session.elderId, session.caregiverId);

  const insightOutput = await generateCareInsight({
    taskResult,
    elderMessage: (session.conversationState.relationshipSlots.message_to_child as string) ?? null,
    childUpdateDelivered,
    relationshipMemory: relProfile?.sharedMemories ?? [],
    elderDisplayName: elder?.displayName ?? "长辈",
    caregiverDisplayName: caregiver?.displayName ?? "家属",
    transcript: session.transcript,  // P0-2: 传递完整通话记录让 insight 有依据
  });

  // Safety check on insight
  const safeInsight = { ...sanitizeCareInsight(insightOutput), confidence: insightOutput.confidence };

  const savedInsight = saveCareInsight({
    elderId: session.elderId,
    caregiverId: session.caregiverId,
    callSessionId: sessionId,
    taskOccurrenceId: session.taskOccurrenceId,
    insight: safeInsight,
  });

  // Add relay message if elder had a message for child
  if (taskResult.messageToChild) {
    store.addRelayMessage({
      id: store.genId("relay"),
      familyId: session.familyId,
      fromType: "elder",
      fromId: session.elderId,
      toType: "caregiver",
      toId: session.caregiverId,
      content: taskResult.messageToChild,
      status: "pending",
      sourceCallSessionId: sessionId,
      createdAt: new Date().toISOString(),
    });
  }

  // Update occurrence
  updateOccurrenceStatus(session.taskOccurrenceId, "completed", taskResult, sessionId);

  // Advance template's next run time
  if (occ) {
    advanceNextRunAt(occ.taskTemplateId);
  }

  // Persist session
  store.updateCallSession(sessionId, {
    status: session.status,
    endedAt: session.endedAt,
    summary: session.summary,
    durationSeconds: session.durationSeconds,
  });

  return {
    summary,
    memoriesExtracted,
    careInsightId: savedInsight.id,
  };
}

export function getCallSession(sessionId: string): CallSession | undefined {
  return store.getCallSession(sessionId);
}
