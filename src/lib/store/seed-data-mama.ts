import type {
  Elder,
  Caregiver,
  CaregiverUpdate,
  RelationshipProfile,
  Memory,
  TaskTemplate,
} from "./types";

/**
 * 第二组 Mock 数据 —— 妈妈（杨艳梅）
 *
 * 背景：
 *  - 蒙古族，辽阳人，1971-05-30 生
 *  - 前年甲状腺癌，已切除甲状腺
 *  - 患有糖尿病，不喜欢监测血糖，不运动，较为肥胖
 *  - 最近几年很少向外社交
 *  - 最近在西安和爸爸一起
 *  - 子女：小雨（user_001）
 */
export function seedMamaData(): {
  elders: Elder[];
  caregivers: Caregiver[];
  caregiverUpdates: CaregiverUpdate[];
  relationshipProfiles: RelationshipProfile[];
  memories: Memory[];
  taskTemplates: TaskTemplate[];
} {
  const familyId = "family_001";

  const elders: Elder[] = [
    {
      id: "elder_003",
      familyId,
      displayName: "妈妈",
      realName: "杨艳梅",
      relation: "mother",
      relationLabel: "妈妈",
      nicknames: ["妈", "老妈", "我妈", "艳梅"],
      phone: "13983879081",
      deviceType: "mobile_app",
      timezone: "Asia/Shanghai",
      availableTime: { start: "08:30", end: "21:30" },
      preferredChannels: ["phone", "app_message"],
      communicationPreference: ["温柔一点", "多聊家常", "别总提病情"],
      healthFocus: ["blood_glucose", "thyroid_follow_up", "exercise", "weight"],
      responseHabit:
        "下午比较容易接电话；不喜欢被反复追问健康状况；聊到家人和辽阳老家会比较开心",
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
  ];

  // 小雨同时也是妈妈的子女，复用 user_001
  const caregivers: Caregiver[] = [];

  const caregiverUpdates: CaregiverUpdate[] = [
    {
      id: "update_002",
      caregiverId: "user_001",
      content: "小雨最近工作忙，但一直惦记妈妈在西安的生活情况，希望妈妈能多出去走走",
      canShareWithElder: true,
      validFrom: "2026-06-01T00:00:00+08:00",
      validUntil: "2026-06-30T23:59:59+08:00",
      createdAt: "2026-06-10T10:00:00+08:00",
    },
  ];

  const relationshipProfiles: RelationshipProfile[] = [
    {
      id: "rel_002",
      familyId,
      elderId: "elder_003",
      caregiverId: "user_001",
      toneProfile: ["温暖", "轻松", "像闺女唠嗑", "不说教"],
      sharedMemories: [
        "妈妈是蒙古族，老家在辽阳，喜欢聊老家的事",
        "妈妈前年做了甲状腺切除手术，恢复得还行但一直不太愿意提",
        "妈妈最近在西安和爸爸一起生活",
        "小雨一直想让妈妈多运动、多测血糖，但妈妈不太配合",
        "妈妈最近几年社交变少了，子女比较担心她的心情",
      ],
      sensitiveTopics: [
        "不要说'你必须测血糖'",
        "不要用命令的语气",
        "不要过度强调病情的严重性",
        "不要说'你太胖了需要减肥'",
        "不要提'甲状腺癌'这个词",
      ],
      preferredContactStyle:
        "先聊西安的生活、聊爸爸、聊家常，自然地关心健康，不要一上来就问血糖",
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
  ];

  const memories: Memory[] = [
    {
      id: "mem_004",
      familyId,
      elderId: "elder_003",
      relationshipProfileId: "rel_002",
      memoryType: "health_memory",
      content: "妈妈前年因甲状腺癌切除了甲状腺，目前需要长期服用优甲乐",
      confidence: 0.95,
      importance: "high",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
    {
      id: "mem_005",
      familyId,
      elderId: "elder_003",
      relationshipProfileId: "rel_002",
      memoryType: "health_memory",
      content: "妈妈患有糖尿病，但不喜欢监测血糖，对测血糖有抵触情绪",
      confidence: 0.9,
      importance: "high",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
    {
      id: "mem_006",
      familyId,
      elderId: "elder_003",
      relationshipProfileId: "rel_002",
      memoryType: "routine_memory",
      content: "妈妈最近几年很少向外社交，子女担心她的心情和社交状态",
      confidence: 0.85,
      importance: "medium",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
    {
      id: "mem_007",
      familyId,
      elderId: "elder_003",
      relationshipProfileId: "rel_002",
      memoryType: "routine_memory",
      content: "妈妈几乎不运动，体重偏重，但直接提减肥会引起反感",
      confidence: 0.88,
      importance: "medium",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
    {
      id: "mem_008",
      familyId,
      elderId: "elder_003",
      relationshipProfileId: "rel_002",
      memoryType: "relationship_memory",
      content: "妈妈是蒙古族辽阳人，聊老家和民族相关的话题会比较开心",
      confidence: 0.92,
      importance: "medium",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
    {
      id: "mem_009",
      familyId,
      elderId: "elder_003",
      relationshipProfileId: "rel_002",
      memoryType: "relationship_memory",
      content: "妈妈最近在西安和爸爸一起生活，小雨希望了解她在西安的日常",
      confidence: 0.9,
      importance: "medium",
      requiresReview: false,
      reviewed: true,
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
  ];

  const taskTemplates: TaskTemplate[] = [
    {
      id: "tpl_002",
      familyId,
      elderId: "elder_003",
      caregiverId: "user_001",
      title: "每日关心妈妈健康与生活",
      taskType: "daily_care_call",
      recurrenceRule: {
        type: "daily",
        time: "15:00",
        timezone: "Asia/Shanghai",
      },
      primaryObjectives: [
        { type: "health_check", content: "了解今天血糖情况（用关心的方式，不命令）" },
        { type: "health_check", content: "关心甲状腺术后恢复，优甲乐是否按时吃" },
        { type: "other", content: "鼓励妈妈出门走走、活动一下（不说减肥）" },
      ],
      relationshipObjectives: [
        {
          type: "deliver_child_update",
          content: "小雨虽然工作忙，但一直惦记妈妈在西安过得怎么样",
        },
        {
          type: "ask_elder_message",
          content: "问问妈妈在西安的生活、和爸爸的日常",
        },
        {
          type: "express_care",
          content: "让妈妈感受到子女的关心，而不是被监控",
        },
      ],
      requiredSlots: [
        "blood_glucose_checked",
        "thyroid_medication_taken",
        "daily_activity",
        "mood_and_social",
        "message_to_child",
      ],
      retryPolicy: { maxAttempts: 2, retryAfterMinutes: 15 },
      callPolicy: {
        maxDurationSeconds: 240,
        maxExtraQuestions: 3,
        tone: "warm_family_like",
      },
      status: "active",
      nextRunAt: "2026-06-12T15:00:00+08:00",
      createdAt: "2026-06-10T10:00:00+08:00",
      updatedAt: "2026-06-10T10:00:00+08:00",
    },
  ];

  return {
    elders,
    caregivers,
    caregiverUpdates,
    relationshipProfiles,
    memories,
    taskTemplates,
  };
}
