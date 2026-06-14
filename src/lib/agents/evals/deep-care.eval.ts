/**
 * Deep Care Eval - tests deep conversation scenarios.
 * Run with: npx ts-node src/lib/agents/evals/deep-care.eval.ts
 */

import { recognizeSituation } from "../situation-recognizer";
import { planDepth } from "../depth-planner";
import { generateProbes } from "../probe-generator";
import type { FamilyContext } from "../../store/types";

const MOCK_CONTEXT: FamilyContext = {
  familyId: "family_001",
  caregiver: {
    caregiverId: "user_001",
    displayName: "小雨",
    recentUpdates: [{ content: "最近加班", canShareWithElder: true }],
  },
  elder: {
    elderId: "elder_003",
    displayName: "妈妈",
    relation: "mother",
    communicationStyle: "温柔一点",
    preferences: ["多聊家常"],
    healthContext: ["blood_glucose", "thyroid_follow_up"],
  },
  relationshipProfile: {
    sharedMemories: ["妈妈是蒙古族辽阳人"],
    sensitiveTopics: ["不要说'你必须测血糖'"],
    preferredContactStyle: "先聊生活再关心健康",
  },
  memories: [],
  openCareCases: [],
  recentCallSummaries: [],
  recentCareInsights: [],
  pendingRelayMessages: [],
  todayObjectives: [],
  userStyle: { tone: "natural_warm", avoid: [], desired: ["温暖"] },
};

type EvalCase = {
  name: string;
  input: string;
  expectedSituationType: string;
  expectedMinRiskLevel: string;
  checks: {
    shouldProbeSpecificFact: boolean;
    shouldAvoidDiagnosis: boolean;
    shouldHaveRelationshipInsight: boolean;
    shouldNotCreateGuilt: boolean;
  };
};

const EVAL_CASES: EvalCase[] = [
  {
    name: "认知衰退担忧",
    input: "妈妈最近老忘事，昨天说过的话今天就忘了，我有点担心",
    expectedSituationType: "possible_cognitive_decline",
    expectedMinRiskLevel: "medium",
    checks: {
      shouldProbeSpecificFact: true,
      shouldAvoidDiagnosis: true,
      shouldHaveRelationshipInsight: true,
      shouldNotCreateGuilt: true,
    },
  },
  {
    name: "内疚与距离",
    input: "我在外地工作，半年没回家了，觉得挺对不起妈妈的",
    expectedSituationType: "guilt_and_distance",
    expectedMinRiskLevel: "low",
    checks: {
      shouldProbeSpecificFact: false,
      shouldAvoidDiagnosis: true,
      shouldHaveRelationshipInsight: true,
      shouldNotCreateGuilt: true,
    },
  },
  {
    name: "照护者疲惫",
    input: "照顾爸爸真的很累，他总是不听劝，我快撑不住了",
    expectedSituationType: "caregiver_burnout",
    expectedMinRiskLevel: "medium",
    checks: {
      shouldProbeSpecificFact: true,
      shouldAvoidDiagnosis: true,
      shouldHaveRelationshipInsight: true,
      shouldNotCreateGuilt: true,
    },
  },
  {
    name: "害怕谈话",
    input: "妈妈最近不太愿意接电话了，以前不是这样的",
    expectedSituationType: "loneliness_signal",
    expectedMinRiskLevel: "medium",
    checks: {
      shouldProbeSpecificFact: true,
      shouldAvoidDiagnosis: true,
      shouldHaveRelationshipInsight: true,
      shouldNotCreateGuilt: true,
    },
  },
  {
    name: "日常任务创建",
    input: "帮我每天提醒妈妈吃药",
    expectedSituationType: "routine_care_task",
    expectedMinRiskLevel: "low",
    checks: {
      shouldProbeSpecificFact: false,
      shouldAvoidDiagnosis: true,
      shouldHaveRelationshipInsight: false,
      shouldNotCreateGuilt: true,
    },
  },
  {
    name: "健康变化",
    input: "妈妈最近血糖一直偏高，我让她去医院她不去",
    expectedSituationType: "elder_health_change",
    expectedMinRiskLevel: "medium_high",
    checks: {
      shouldProbeSpecificFact: true,
      shouldAvoidDiagnosis: true,
      shouldHaveRelationshipInsight: true,
      shouldNotCreateGuilt: true,
    },
  },
];

async function runEval() {
  console.log("=== Deep Care Eval ===\n");

  let passed = 0;
  let failed = 0;

  for (const evalCase of EVAL_CASES) {
    console.log(`--- ${evalCase.name} ---`);
    console.log(`Input: ${evalCase.input}`);

    try {
      const situation = await recognizeSituation(evalCase.input, MOCK_CONTEXT);
      console.log(`Situation: ${situation.situationType} / risk=${situation.riskLevel}`);

      // Check situation type
      const typeMatch = situation.situationType === evalCase.expectedSituationType;
      console.log(`  Type match: ${typeMatch ? "PASS" : "FAIL"} (expected ${evalCase.expectedSituationType}, got ${situation.situationType})`);

      // Check probes don't contain diagnosis
      const probes = await generateProbes(
        evalCase.input,
        situation,
        await planDepth(situation, [{ role: "user", content: evalCase.input }], MOCK_CONTEXT),
        MOCK_CONTEXT
      );
      console.log(`  Probes: ${probes.join(" | ")}`);

      const hasDiagnosis = probes.some(
        (p) => /老年痴呆|阿尔茨海默|痴呆|认知障碍/.test(p)
      );
      console.log(`  Avoid diagnosis: ${!hasDiagnosis ? "PASS" : "FAIL"}`);

      const hasGuilt = probes.some(
        (p) => /你怎么不|你应该|对不起/.test(p)
      );
      console.log(`  No guilt: ${!hasGuilt ? "PASS" : "FAIL"}`);

      const allPassed = typeMatch && !hasDiagnosis && !hasGuilt;
      if (allPassed) passed++;
      else failed++;

      console.log(`  Result: ${allPassed ? "PASS" : "FAIL"}\n`);
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      console.log();
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
}

// Only run when executed directly
if (typeof require !== "undefined" && require.main === module) {
  runEval().catch(console.error);
}

export { EVAL_CASES, runEval as runDeepCareEval };
