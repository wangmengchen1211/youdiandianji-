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
import { generateCallPlan } from "../agents/call-plan-generator";
import { generateConversationReply } from "../agents/relational-conversation";
import { extractResponseUnderstanding } from "../agents/response-understanding";
import { extractMemories } from "../agents/memory-curator";
import { generateCareInsight } from "../agents/care-insight-writer";
import { sanitizeAssistantReply, sanitizeCareInsight } from "../agents/safety-guard";
import {
  createInitialState,
  nextStage,
  shouldListenAndReflect,
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
 * Process one turn of the conversation.
 * Receives elder input, runs Response Understanding, advances state, generates next reply.
 */
export async function processTurn(
  sessionId: string,
  elderInput: string
): Promise<{
  assistantReply: string;
  stage: CallStage;
  taskSlots: Record<string, unknown>;
  isCallEnding: boolean;
}> {
  const session = store.getCallSession(sessionId);
  if (!session) throw new Error(`CallSession ${sessionId} not found`);
  if (!session.callPlan) throw new Error(`CallSession ${sessionId} has no call plan`);

  const occ = store.getTaskOccurrence(session.taskOccurrenceId);
  const template = store.getTaskTemplate(occ?.taskTemplateId ?? "");

  // Add elder input to transcript
  session.transcript.push({
    speaker: "elder",
    text: elderInput,
    stage: session.conversationState.stage,
    timestamp: new Date().toISOString(),
  });

  // Run Response Understanding (every turn)
  const understanding = await extractResponseUnderstanding(
    elderInput,
    template?.requiredSlots ?? []
  );

  // Update conversation state with extracted slots
  session.conversationState.taskSlots = {
    ...session.conversationState.taskSlots,
    ...understanding.slots,
  };
  if (understanding.messageToChild) {
    session.conversationState.relationshipSlots.message_to_child =
      understanding.messageToChild;
  }
  session.conversationState.riskSignals = [
    ...session.conversationState.riskSignals,
    ...understanding.riskSignals,
  ];

  // Determine next stage via state machine
  let currentStage = session.conversationState.stage;

  // Special: if at open_care_question and elder shows emotion, enter listen_and_reflect
  if (currentStage === "open_care_question" && shouldListenAndReflect(elderInput)) {
    currentStage = "listen_and_reflect";
    session.conversationState.stage = "listen_and_reflect";
  }

  // Advance to next stage
  const nextStg = nextStage(session.conversationState);
  session.conversationState.completedStages.push(currentStage);
  session.conversationState.stage = nextStg;
  session.conversationState.turnCount += 1;

  // Check if call is ending
  const isCallEnding = nextStg === "closing" || nextStg === "post_call_analysis";

  // Generate next reply
  const objectives = template
    ? [
        ...template.primaryObjectives.map((o) => o.content),
        ...template.relationshipObjectives.map((o) => o.content),
      ]
    : [];
  const context = composeRelationshipContext(session.elderId, session.caregiverId, objectives);

  const reply = await generateConversationReply({
    context,
    callPlan: session.callPlan,
    currentStage: nextStg,
    transcript: session.transcript,
    conversationState: session.conversationState,
  });

  // Safety check
  const safeReply = sanitizeAssistantReply(reply.assistantReply);
  const assistantReply = safeReply.sanitized;

  // Add assistant reply to transcript
  session.transcript.push({
    speaker: "assistant",
    text: assistantReply,
    stage: nextStg,
    timestamp: new Date().toISOString(),
  });

  // If closing, mark completed stages
  if (nextStg === "closing") {
    session.conversationState.completedStages.push("closing");
    session.conversationState.stage = "post_call_analysis";
  }

  // Persist
  store.updateCallSession(sessionId, {
    transcript: session.transcript,
    conversationState: session.conversationState,
  });

  return {
    assistantReply,
    stage: nextStg,
    taskSlots: session.conversationState.taskSlots,
    isCallEnding,
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
    .map((t) => `${t.speaker === "assistant" ? "小助理" : elder?.displayName ?? "长辈"}：${t.text}`)
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

  // Build task result
  const taskResult: TaskResult = {
    status: session.conversationState.taskSlots.medication_taken ? "completed" : "partially_completed",
    slots: session.conversationState.taskSlots,
    riskSignals: session.conversationState.riskSignals,
    messageToChild: (session.conversationState.relationshipSlots.message_to_child as string) ?? null,
    confidence: 0.85,
    needsReview: session.conversationState.riskSignals.length > 0,
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
