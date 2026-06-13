import type { ElderProfileTemplate } from "./elder-profile-template";

/**
 * Elder Profile Mock Data - Mama (Yang Yanmei / Yang Yanmei)
 * Mongolian ethnicity, from Liaoyang, born 1971-05-30
 * Thyroid cancer surgery (2024), diabetes, reluctant to monitor blood glucose
 * No exercise, overweight, low social activity, currently in Xi'an with dad
 */
export const mamaProfileTemplate: ElderProfileTemplate = {
  basicInfo: {
    displayName: "mama", realName: "Yang Yanmei",
    relation: "mother", relationLabel: "mama",
    nicknames: ["ma", "lao ma", "wo ma", "Yanmei"],
    phone: "13983879081", ethnicity: "Mongolian", birthplace: "Liaoyang",
    birthDate: "1971-05-30", gender: "female",
  },
  healthProfile: {
    chronicDiseases: [{
      name: "diabetes", diagnosedAt: "2020", severity: "moderate",
      managementAttitude: "reluctant to monitor blood glucose, resistant to reminders",
      monitoringWillingness: "low",
    }],
    surgicalHistory: [{
      procedure: "thyroidectomy", reason: "thyroid cancer", year: 2024,
      organAffected: "thyroid", recoveryStatus: "recovered but reluctant to discuss",
      ongoingMedication: "levothyroxine",
    }],
    currentMedications: ["levothyroxine"],
    healthConcerns: ["blood_glucose", "thyroid_follow_up", "exercise", "weight"],
    healthAttitudes: [
      { area: "blood glucose monitoring", attitude: "dislikes reminders about testing", willingness: "low" },
      { area: "exercise", attitude: "almost never exercises", willingness: "refuse" },
      { area: "thyroid medication", attitude: "takes levothyroxine regularly but dislikes being asked", willingness: "selective" },
      { area: "weight management", attitude: "overweight, direct comments cause resentment", willingness: "refuse" },
    ],
  },
  lifestyleProfile: {
    livingSituation: "living with dad in Xi'an", currentLocation: "Xi'an",
    livingWith: ["dad"], socialActivity: "very_low", exerciseHabit: "never",
    dailyRoutine: "casual schedule, easier to reach in the afternoon",
    hobbies: ["chatting", "watching TV dramas", "caring about children"],
    personalityTraits: ["gentle", "does not want to burden others", "happy when talking about family and hometown"],
  },
  communicationProfile: {
    preferredTime: { start: "08:30", end: "21:30" },
    preferredChannels: ["phone", "app_message"],
    topicsEnjoy: ["daily life in Xi'an", "dad's updates", "Liaoyang hometown", "Mongolian culture", "children's work and life"],
    topicsAvoid: ["repeated blood glucose questions", "mentioning thyroid cancer directly", "commanding tone about exercise/weight"],
    communicationStyle: ["warm", "casual chat", "avoid medical focus", "like daughter chatting", "no lecturing"],
    responseHabit: "easier to answer in afternoon; dislikes health interrogations; brightens with family and hometown topics",
  },
  relationshipNotes: {
    sensitiveTopics: [
      "do not say you must test blood sugar",
      "do not use commanding tone",
      "do not overemphasize illness severity",
      "do not comment on weight directly",
      "do not mention thyroid cancer",
    ],
    sharedMemories: [
      "Mongolian from Liaoyang, enjoys hometown stories",
      "Had thyroidectomy in 2024, recovered but reluctant to discuss",
      "Currently in Xi'an with dad",
      "Children want more exercise and glucose monitoring but mama resists",
      "Social activity decreased in recent years, family is concerned",
    ],
    tonePreference: ["warm", "relaxed", "like daughter chatting", "no lecturing"],
    contactStylePreference: "start with daily life, chat about dad, then naturally bring up health",
  },
};