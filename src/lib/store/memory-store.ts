import type {
  Elder,
  Caregiver,
  CaregiverUpdate,
  RelationshipProfile,
  TaskTemplate,
  TaskOccurrence,
  CallSession,
  RelayMessage,
  Memory,
  CareInsight,
} from "./types";
import { seedDemoData } from "./seed-data";

type SeedData = ReturnType<typeof seedDemoData>;

export class MemoryStore {
  familyId: string;
  elders: Elder[];
  caregivers: Caregiver[];
  caregiverUpdates: CaregiverUpdate[];
  relationshipProfiles: RelationshipProfile[];
  taskTemplates: TaskTemplate[];
  taskOccurrences: TaskOccurrence[];
  callSessions: CallSession[];
  relayMessages: RelayMessage[];
  memories: Memory[];
  careInsights: CareInsight[];

  private idCounter = 100;

  constructor(seed: SeedData) {
    this.familyId = seed.familyId;
    this.elders = [...seed.elders];
    this.caregivers = [...seed.caregivers];
    this.caregiverUpdates = [...seed.caregiverUpdates];
    this.relationshipProfiles = [...seed.relationshipProfiles];
    this.taskTemplates = [...seed.taskTemplates];
    this.taskOccurrences = [];
    this.callSessions = [];
    this.relayMessages = [];
    this.memories = [...seed.memories];
    this.careInsights = [];
  }

  genId(prefix: string): string {
    return `${prefix}_${String(++this.idCounter).padStart(3, "0")}`;
  }

  // --- Elders ---
  getElder(id: string): Elder | undefined {
    return this.elders.find((e) => e.id === id);
  }
  getElders(): Elder[] {
    return this.elders;
  }
  findElderByName(name: string): Elder | undefined {
    return this.elders.find(
      (e) =>
        e.displayName === name ||
        e.nicknames.includes(name) ||
        e.relationLabel === name
    );
  }
  addElder(elder: Elder): Elder {
    this.elders.push(elder);
    return elder;
  }

  // --- Caregivers ---
  getCaregiver(id: string): Caregiver | undefined {
    return this.caregivers.find((c) => c.id === id);
  }

  // --- Caregiver Updates ---
  getUpdatesForCaregiver(caregiverId: string): CaregiverUpdate[] {
    return this.caregiverUpdates.filter((u) => u.caregiverId === caregiverId);
  }

  // --- Relationship Profiles ---
  getRelationshipProfile(
    elderId: string,
    caregiverId: string
  ): RelationshipProfile | undefined {
    return this.relationshipProfiles.find(
      (r) => r.elderId === elderId && r.caregiverId === caregiverId
    );
  }

  // --- Task Templates ---
  getTaskTemplate(id: string): TaskTemplate | undefined {
    return this.taskTemplates.find((t) => t.id === id);
  }
  getActiveTaskTemplates(): TaskTemplate[] {
    return this.taskTemplates.filter((t) => t.status === "active");
  }
  addTaskTemplate(template: TaskTemplate): TaskTemplate {
    this.taskTemplates.push(template);
    return template;
  }
  updateTaskTemplate(
    id: string,
    patch: Partial<TaskTemplate>
  ): TaskTemplate | undefined {
    const t = this.getTaskTemplate(id);
    if (t) Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    return t;
  }
  getTaskTemplatesForElder(elderId: string): TaskTemplate[] {
    return this.taskTemplates.filter((t) => t.elderId === elderId);
  }

  // --- Task Occurrences ---
  getTaskOccurrence(id: string): TaskOccurrence | undefined {
    return this.taskOccurrences.find((o) => o.id === id);
  }
  addTaskOccurrence(occ: TaskOccurrence): TaskOccurrence {
    this.taskOccurrences.push(occ);
    return occ;
  }
  updateTaskOccurrence(
    id: string,
    patch: Partial<TaskOccurrence>
  ): TaskOccurrence | undefined {
    const o = this.getTaskOccurrence(id);
    if (o) Object.assign(o, patch, { updatedAt: new Date().toISOString() });
    return o;
  }
  getOccurrencesForTemplate(templateId: string): TaskOccurrence[] {
    return this.taskOccurrences.filter(
      (o) => o.taskTemplateId === templateId
    );
  }
  getOccurrencesByStatus(status: string): TaskOccurrence[] {
    return this.taskOccurrences.filter((o) => o.status === status);
  }

  // --- Call Sessions ---
  getCallSession(id: string): CallSession | undefined {
    return this.callSessions.find((s) => s.id === id);
  }
  addCallSession(session: CallSession): CallSession {
    this.callSessions.push(session);
    return session;
  }
  updateCallSession(
    id: string,
    patch: Partial<CallSession>
  ): CallSession | undefined {
    const s = this.getCallSession(id);
    if (s) Object.assign(s, patch, { updatedAt: new Date().toISOString() });
    return s;
  }
  getCallSessionsForOccurrence(occurrenceId: string): CallSession[] {
    return this.callSessions.filter(
      (s) => s.taskOccurrenceId === occurrenceId
    );
  }
  getRecentCallSummaries(elderId: string, limit = 5): string[] {
    return this.callSessions
      .filter((s) => s.elderId === elderId && s.summary)
      .sort(
        (a, b) =>
          new Date(b.endedAt ?? "").getTime() -
          new Date(a.endedAt ?? "").getTime()
      )
      .slice(0, limit)
      .map((s) => s.summary!);
  }

  // --- Relay Messages ---
  getRelayMessages(
    fromType: string,
    toType: string,
    status?: string
  ): RelayMessage[] {
    return this.relayMessages.filter(
      (m) =>
        m.fromType === fromType &&
        m.toType === toType &&
        (!status || m.status === status)
    );
  }
  getPendingRelayMessages(toType: string, toId: string): RelayMessage[] {
    return this.relayMessages.filter(
      (m) =>
        m.toType === toType && m.toId === toId && m.status === "pending"
    );
  }
  addRelayMessage(msg: RelayMessage): RelayMessage {
    this.relayMessages.push(msg);
    return msg;
  }
  updateRelayMessage(
    id: string,
    patch: Partial<RelayMessage>
  ): RelayMessage | undefined {
    const m = this.relayMessages.find((r) => r.id === id);
    if (m) Object.assign(m, patch);
    return m;
  }

  // --- Memories ---
  getMemories(elderId?: string): Memory[] {
    return elderId
      ? this.memories.filter((m) => m.elderId === elderId)
      : this.memories;
  }
  addMemory(memory: Memory): Memory {
    this.memories.push(memory);
    return memory;
  }
  getMemoriesForElder(elderId: string, limit = 20): Memory[] {
    return this.memories
      .filter((m) => m.elderId === elderId && m.reviewed)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);
  }

  // --- Care Insights ---
  getCareInsights(caregiverId?: string): CareInsight[] {
    return caregiverId
      ? this.careInsights.filter((i) => i.caregiverId === caregiverId)
      : this.careInsights;
  }
  addCareInsight(insight: CareInsight): CareInsight {
    this.careInsights.push(insight);
    return insight;
  }

  // --- Debug ---
  reset(seed: SeedData): void {
    const fresh = new MemoryStore(seed);
    Object.assign(this, fresh);
  }

  snapshot() {
    return {
      familyId: this.familyId,
      elders: this.elders,
      caregivers: this.caregivers,
      caregiverUpdates: this.caregiverUpdates,
      relationshipProfiles: this.relationshipProfiles,
      taskTemplates: this.taskTemplates,
      taskOccurrences: this.taskOccurrences,
      callSessions: this.callSessions,
      relayMessages: this.relayMessages,
      memories: this.memories,
      careInsights: this.careInsights,
    };
  }
}

// globalThis singleton to survive hot-reload
const globalForStore = globalThis as unknown as {
  __dianjiMemoryStore?: MemoryStore;
};

export const store: MemoryStore =
  globalForStore.__dianjiMemoryStore ?? new MemoryStore(seedDemoData());

if (process.env.NODE_ENV !== "production") {
  globalForStore.__dianjiMemoryStore = store;
}
