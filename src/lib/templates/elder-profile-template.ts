import type { Elder, RelationshipProfile, Memory } from "../store/types";

export type ElderProfileTemplate = {
  basicInfo: {
    displayName: string; realName?: string; relation: string; relationLabel: string;
    nicknames: string[]; phone: string; ethnicity?: string; birthplace?: string;
    birthDate?: string; gender?: "male" | "female";
  };
  healthProfile: {
    chronicDiseases: ChronicDiseaseEntry[]; surgicalHistory: SurgicalEntry[];
    currentMedications: string[]; healthConcerns: string[]; healthAttitudes: HealthAttitude[];
  };
  lifestyleProfile: {
    livingSituation: string; currentLocation?: string; livingWith?: string[];
    socialActivity: SocialActivityLevel; exerciseHabit: ExerciseHabitLevel;
    dailyRoutine?: string; hobbies?: string[]; personalityTraits?: string[];
  };
  communicationProfile: {
    preferredTime: { start: string; end: string };
    preferredChannels: ("phone" | "app_message")[];
    topicsEnjoy: string[]; topicsAvoid: string[]; communicationStyle: string[]; responseHabit?: string;
  };
  relationshipNotes: {
    sensitiveTopics: string[]; sharedMemories: string[];
    tonePreference: string[]; contactStylePreference: string;
  };
};

export type ChronicDiseaseEntry = {
  name: string; diagnosedAt?: string; severity: "mild" | "moderate" | "severe";
  managementAttitude: string; monitoringWillingness: "high" | "medium" | "low" | "refuse";
};
export type SurgicalEntry = {
  procedure: string; reason: string; year: number;
  organAffected?: string; recoveryStatus?: string; ongoingMedication?: string;
};
export type HealthAttitude = {
  area: string; attitude: string; willingness: "cooperative" | "reluctant" | "refuse" | "selective";
};
export type SocialActivityLevel = "very_active" | "moderate" | "low" | "very_low" | "isolated";
export type ExerciseHabitLevel = "regular" | "occasional" | "rarely" | "never";

export function templateToElder(t: ElderProfileTemplate, familyId: string, elderId: string): Elder {
  return {
    id: elderId, familyId, displayName: t.basicInfo.displayName, realName: t.basicInfo.realName,
    relation: t.basicInfo.relation, relationLabel: t.basicInfo.relationLabel,
    nicknames: t.basicInfo.nicknames, phone: t.basicInfo.phone, deviceType: "mobile_app",
    timezone: "Asia/Shanghai", availableTime: t.communicationProfile.preferredTime,
    preferredChannels: t.communicationProfile.preferredChannels,
    communicationPreference: t.communicationProfile.communicationStyle,
    healthFocus: t.healthProfile.healthConcerns, responseHabit: t.communicationProfile.responseHabit,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

export function templateToRelationshipProfile(
  t: ElderProfileTemplate, familyId: string, elderId: string, caregiverId: string
): RelationshipProfile {
  return {
    id: `rel_${elderId}_${caregiverId}`, familyId, elderId, caregiverId,
    toneProfile: t.relationshipNotes.tonePreference, sharedMemories: t.relationshipNotes.sharedMemories,
    sensitiveTopics: t.relationshipNotes.sensitiveTopics,
    preferredContactStyle: t.relationshipNotes.contactStylePreference,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

export function healthProfileToMemories(t: ElderProfileTemplate, familyId: string, elderId: string): Memory[] {
  const memories: Memory[] = [];
  const now = new Date().toISOString();
  for (const d of t.healthProfile.chronicDiseases) {
    memories.push({
      id: `mem_health_${elderId}_${d.name}`, familyId, elderId, memoryType: "health_memory",
      content: `${t.basicInfo.displayName} has ${d.name}, attitude: ${d.managementAttitude}`,
      confidence: 0.9, importance: "high", requiresReview: false, reviewed: true, createdAt: now, updatedAt: now,
    });
  }
  for (const s of t.healthProfile.surgicalHistory) {
    memories.push({
      id: `mem_surgery_${elderId}_${s.procedure}`, familyId, elderId, memoryType: "health_memory",
      content: `${t.basicInfo.displayName} had ${s.procedure} in ${s.year} (${s.reason}), ${s.recoveryStatus || ""}${s.ongoingMedication ? ", medication: " + s.ongoingMedication : ""}`,
      confidence: 0.95, importance: "high", requiresReview: false, reviewed: true, createdAt: now, updatedAt: now,
    });
  }
  if (t.lifestyleProfile.socialActivity === "very_low" || t.lifestyleProfile.socialActivity === "isolated") {
    memories.push({
      id: `mem_social_${elderId}`, familyId, elderId, memoryType: "routine_memory",
      content: `${t.basicInfo.displayName} has very low social activity, family is concerned`,
      confidence: 0.85, importance: "medium", requiresReview: false, reviewed: true, createdAt: now, updatedAt: now,
    });
  }
  if (t.lifestyleProfile.exerciseHabit === "rarely" || t.lifestyleProfile.exerciseHabit === "never") {
    memories.push({
      id: `mem_exercise_${elderId}`, familyId, elderId, memoryType: "routine_memory",
      content: `${t.basicInfo.displayName} rarely exercises, direct weight loss suggestions cause resistance`,
      confidence: 0.88, importance: "medium", requiresReview: false, reviewed: true, createdAt: now, updatedAt: now,
    });
  }
  if (t.basicInfo.ethnicity || t.basicInfo.birthplace) {
    const parts: string[] = [];
    if (t.basicInfo.ethnicity) parts.push(t.basicInfo.ethnicity);
    if (t.basicInfo.birthplace) parts.push(t.basicInfo.birthplace);
    memories.push({
      id: `mem_culture_${elderId}`, familyId, elderId, memoryType: "relationship_memory",
      content: `${t.basicInfo.displayName} is from ${parts.join(", ")}, enjoys talking about hometown`,
      confidence: 0.92, importance: "medium", requiresReview: false, reviewed: true, createdAt: now, updatedAt: now,
    });
  }
  return memories;
}