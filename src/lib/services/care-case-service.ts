import { store } from "../store/memory-store";
import type {
  CareCase,
  CareCaseRiskFlag,
  CaseFormulationUpdate,
} from "../store/types";

/**
 * Care Case Service - manages the lifecycle of care cases (CareCase).
 * Supports create, update (append facts/unknowns/risks), and follow-up scheduling.
 */

export function createCareCase(params: {
  familyId: string;
  elderId: string;
  caregiverId: string;
  caseType: string;
  summary: string;
  knownFacts?: string[];
  unknowns?: string[];
  riskFlags?: CareCaseRiskFlag[];
  nextSteps?: string[];
}): CareCase {
  const now = new Date().toISOString();
  const careCase: CareCase = {
    id: store.genId("case"),
    familyId: params.familyId,
    elderId: params.elderId,
    caregiverId: params.caregiverId,
    caseType: params.caseType,
    status: "open",
    summary: params.summary,
    knownFacts: params.knownFacts ?? [],
    unknowns: params.unknowns ?? [],
    riskFlags: params.riskFlags ?? [],
    relationshipContext: {},
    nextSteps: params.nextSteps ?? [],
    createdAt: now,
    updatedAt: now,
  };

  // Store if method available (Phase E extends store)
  if (typeof (store as any).addCareCase === "function") {
    (store as any).addCareCase(careCase);
  }

  return careCase;
}

export function appendKnownFacts(caseId: string, facts: string[]): void {
  const careCase = getCaseById(caseId);
  if (!careCase) return;
  const newFacts = facts.filter((f) => !careCase.knownFacts.includes(f));
  if (newFacts.length > 0) {
    careCase.knownFacts = [...careCase.knownFacts, ...newFacts];
    careCase.updatedAt = new Date().toISOString();
  }
}

export function updateUnknowns(caseId: string, unknowns: string[]): void {
  const careCase = getCaseById(caseId);
  if (!careCase) return;
  careCase.unknowns = unknowns;
  careCase.updatedAt = new Date().toISOString();
}

export function addRiskFlags(caseId: string, riskFlags: CareCaseRiskFlag[]): void {
  const careCase = getCaseById(caseId);
  if (!careCase) return;
  careCase.riskFlags = [...careCase.riskFlags, ...riskFlags];
  careCase.updatedAt = new Date().toISOString();
}

export function updateNextSteps(caseId: string, nextSteps: string[]): void {
  const careCase = getCaseById(caseId);
  if (!careCase) return;
  careCase.nextSteps = nextSteps;
  careCase.updatedAt = new Date().toISOString();
}

export function scheduleFollowUp(caseId: string, followUpAt: string): void {
  const careCase = getCaseById(caseId);
  if (!careCase) return;
  careCase.followUpAt = followUpAt;
  careCase.updatedAt = new Date().toISOString();
}

export function changeCaseStatus(
  caseId: string,
  status: "open" | "resolved" | "escalated"
): void {
  const careCase = getCaseById(caseId);
  if (!careCase) return;
  careCase.status = status;
  careCase.updatedAt = new Date().toISOString();
}

/**
 * Apply a CaseFormulationUpdate to an existing or new case.
 * If caseId is null, creates a new case.
 */
export function applyCaseFormulation(
  caseId: string | null,
  update: CaseFormulationUpdate,
  meta: {
    familyId: string;
    elderId: string;
    caregiverId: string;
    caseType: string;
    summary: string;
  }
): CareCase {
  let careCase: CareCase;

  if (caseId) {
    const existing = getCaseById(caseId);
    if (existing) {
      careCase = existing;
    } else {
      careCase = createCareCase(meta);
    }
  } else {
    careCase = createCareCase(meta);
  }

  // Apply updates
  if (update.newKnownFacts.length > 0) {
    appendKnownFacts(careCase.id, update.newKnownFacts);
  }
  if (update.updatedUnknowns.length > 0) {
    updateUnknowns(careCase.id, update.updatedUnknowns);
  }
  if (update.newRiskFlags.length > 0) {
    addRiskFlags(careCase.id, update.newRiskFlags);
  }
  if (update.updatedNextSteps.length > 0) {
    updateNextSteps(careCase.id, update.updatedNextSteps);
  }
  if (update.followUpAt) {
    scheduleFollowUp(careCase.id, update.followUpAt);
  }
  if (update.statusChange) {
    changeCaseStatus(careCase.id, update.statusChange);
  }

  return careCase;
}

function getCaseById(caseId: string): CareCase | undefined {
  if (typeof (store as any).getCareCase === "function") {
    return (store as any).getCareCase(caseId) as CareCase | undefined;
  }
  return undefined;
}

export function getOpenCasesForElder(elderId: string): CareCase[] {
  if (typeof (store as any).getOpenCareCases === "function") {
    return (store as any).getOpenCareCases(elderId) as CareCase[];
  }
  return [];
}
