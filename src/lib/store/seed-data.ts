import type {
  Elder,
  Caregiver,
  CaregiverUpdate,
  RelationshipProfile,
  Memory,
  TaskTemplate,
} from "./types";
import { seedMamaData } from "./seed-data-mama";

export function seedDemoData() {
  const familyId = "family_001";

  const elders: Elder[] = [
    {
      id: "elder_001",
      familyId,
      displayName: "奶奶",
      realName: "王秀兰",
      relation: "grandmother",
      relationLabel: "奶奶",
      nicknames: ["奶", "奶奶", "老太太"],
      phone: "13800001111",
      deviceType: "feature_phone",
      timezone: "Asia/Shanghai",
      availableTime: { start: "08:00", end: "21:00" },
      preferredChannels: ["phone"],
      communicationPreference: ["温柔一点", "简短一点"],
      healthFocus: ["medication", "blood_pressure"],
      responseHabit: "晚上比较容易接电话",
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
    {
      id: "elder_002",
      familyId,
      displayName: "爸爸",
      realName: "王建国",
      relation: "father",
      relationLabel: "爸爸",
      nicknames: ["爸", "老爸", "我爸"],
      phone: "13800002222",
      deviceType: "mobile_app",
      timezone: "Asia/Shanghai",
      availableTime: { start: "07:00", end: "22:00" },
      preferredChannels: ["phone", "app_message"],
      communicationPreference: ["直接一点"],
      healthFocus: ["medication", "blood_glucose"],
      responseHabit: "上午容易接电话，晚上不怎么看手机",
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
  ];

  const caregivers: Caregiver[] = [
    {
      id: "user_001",
      familyId,
      displayName: "小雨",
      phone: "13900001111",
      role: "grandchild",
      writingStyle: "natural_warm",
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
  ];

  const caregiverUpdates: CaregiverUpdate[] = [
    {
      id: "update_001",
      caregiverId: "user_001",
      content: "最近项目上线，连续加班，这周可能没法回家",
      canShareWithElder: true,
      validFrom: "2026-01-01T00:00:00+08:00",
      validUntil: "2026-01-07T23:59:59+08:00",
      createdAt: "2026-01-01T10:00:00+08:00",
    },
  ];

  const relationshipProfiles: RelationshipProfile[] = [
    {
      id: "rel_001",
      familyId,
      elderId: "elder_001",
      caregiverId: "user_001",
      toneProfile: ["温暖", "不命令", "像家人托付"],
      sharedMemories: [
        "奶奶经常叮嘱小雨按时吃饭",
        "奶奶嘴上说不用孩子操心，但接到电话会开心",
        "小雨不太会直接表达关心，但一直很惦记奶奶",
      ],
      sensitiveTopics: ["不要提奶奶的年龄", "不要说'你老了'"],
      preferredContactStyle: "先寒暄再提醒，不要一上来就问吃药",
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
  ];

  const memories: Memory[] = [
    {
      id: "mem_001",
      familyId,
      elderId: "elder_001",
      relationshipProfileId: "rel_001",
      memoryType: "relationship_memory",
      content: "奶奶经常叮嘱小雨按时吃饭",
      confidence: 0.9,
      importance: "medium",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
    {
      id: "mem_002",
      familyId,
      elderId: "elder_001",
      relationshipProfileId: "rel_001",
      memoryType: "relationship_memory",
      content: "奶奶嘴上说不用孩子操心，但接到电话会开心",
      confidence: 0.85,
      importance: "high",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
    {
      id: "mem_003",
      familyId,
      elderId: "elder_001",
      memoryType: "health_memory",
      content: "奶奶长期关注血压，晚上需要吃降压药",
      confidence: 0.95,
      importance: "high",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
  ];

  const taskTemplates: TaskTemplate[] = [
    {
      id: "tpl_001",
      familyId,
      elderId: "elder_001",
      caregiverId: "user_001",
      title: "每日关心奶奶并提醒吃降压药",
      taskType: "daily_care_call",
      recurrenceRule: {
        type: "daily",
        time: "20:00",
        timezone: "Asia/Shanghai",
      },
      primaryObjectives: [
        { type: "reminder", content: "提醒吃降压药" },
        { type: "health_check", content: "询问血压情况" },
      ],
      relationshipObjectives: [
        {
          type: "deliver_child_update",
          content: "子女最近项目上线，经常加班，但一直惦记奶奶",
        },
        {
          type: "ask_elder_message",
          content: "询问奶奶有没有话想带给子女",
        },
      ],
      requiredSlots: [
        "medication_taken",
        "blood_pressure",
        "general_condition",
        "message_to_child",
      ],
      retryPolicy: { maxAttempts: 2, retryAfterMinutes: 10 },
      callPolicy: {
        maxDurationSeconds: 180,
        maxExtraQuestions: 2,
        tone: "warm_family_like",
      },
      status: "active",
      nextRunAt: "2026-01-01T20:00:00+08:00",
      createdAt: "2026-01-01T10:00:00+08:00",
      updatedAt: "2026-01-01T10:00:00+08:00",
    },
  ];

  // 合并第二组 mock 数据（妈妈 - 杨艳梅）
  const mamaData = seedMamaData();

  return {
    familyId,
    elders: [...elders, ...mamaData.elders],
    caregivers: [...caregivers, ...mamaData.caregivers],
    caregiverUpdates: [...caregiverUpdates, ...mamaData.caregiverUpdates],
    relationshipProfiles: [...relationshipProfiles, ...mamaData.relationshipProfiles],
    memories: [...memories, ...mamaData.memories],
    taskTemplates: [...taskTemplates, ...mamaData.taskTemplates],
  };
}
