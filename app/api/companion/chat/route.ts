import { NextResponse } from "next/server";
import { composeFamilyContext } from "@/src/lib/agents/family-context-composer";
import { routeAgentRequest } from "@/src/lib/agents/agent-router";
import { recognizeSituation } from "@/src/lib/agents/situation-recognizer";
import { planDepth } from "@/src/lib/agents/depth-planner";
import { generateProbes } from "@/src/lib/agents/probe-generator";
import { buildCaseFormulation } from "@/src/lib/agents/case-formulation-builder";
import { applyCaseFormulation } from "@/src/lib/services/care-case-service";
import { isRiskAtLeast } from "@/src/lib/store/types";
import { isV2Enabled, shouldFallbackToV1 } from "@/src/lib/workflows/feature-flag";
import { handle as chatWorkflowHandle } from "@/src/lib/workflows/chat.workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/companion/chat
 * Deep care conversation API. Routes user input and handles
 * deepCare flow: situationRecognizer -> depthPlanner -> probeGenerator -> caseFormulation
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user_id, elder_id, message, thread_id } = body;

    if (!user_id || !elder_id || !message) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, elder_id, message" },
        { status: 400 }
      );
    }

    // --- v2 Workflow 分支（forceIntent=deep_care，仍执行 situation classification）---
    if (isV2Enabled("chat")) {
      try {
        const v2Result = await chatWorkflowHandle({
          userInput: message,
          elderId: elder_id,
          caregiverId: user_id,
          forceIntent: "deep_care",
          stillClassifySituation: true,
        });

        // 直接输出 v2 格式（companion/chat 前端可适配）
        return NextResponse.json({
          kind: "deepCare",
          content: v2Result.content,
          situation: v2Result.situationAnalysis,
          depth_plan: v2Result.meta,
          case_update: v2Result.data?.case_update ?? null,
          suggested_actions: v2Result.data?.suggested_actions ?? [],
          conversation_state: v2Result.meta,
          meta: { v2: true },
        });
      } catch (v2Error) {
        if (shouldFallbackToV1(v2Error, "chat")) {
          // fall through to v1 implementation below
        } else {
          throw v2Error;
        }
      }
    }

    // Load unified context
    const context = composeFamilyContext(elder_id, user_id);

    // Route the request
    const routeResult = await routeAgentRequest(message, context);

    // If not deepCare, return route result for client to handle
    if (routeResult.kind !== "deepCare") {
      return NextResponse.json({
        kind: routeResult.kind,
        confidence: routeResult.confidence,
        reason: routeResult.reason,
        content: getRedirectHint(routeResult.kind),
      });
    }

    // Deep Care flow
    // Step 1: Situation Recognition
    const situation = routeResult.situationAnalysis
      ? routeResult.situationAnalysis
      : await recognizeSituation(message, context);

    // Step 2: High risk → safety guidance
    if (isRiskAtLeast(situation.riskLevel, "high")) {
      return NextResponse.json({
        kind: "deepCare",
        situation,
        content: buildSafetyResponse(situation),
        suggested_actions: [
          "建议尽快联系家人或医生",
          "如果需要，可以创建一个关怀任务",
        ],
        conversation_state: { stage: "safety_guidance" },
      });
    }

    // Step 3: Depth Planning
    const conversationHistory = [
      { role: "user", content: message },
    ];
    const depthPlan = await planDepth(situation, conversationHistory, context);

    // Step 4: Generate probes
    const probes = await generateProbes(message, situation, depthPlan, context);

    // Step 5: Case Formulation (if needed)
    let caseUpdate = null;
    if (depthPlan.shouldCreateCase) {
      const formulation = await buildCaseFormulation(
        conversationHistory,
        context.openCareCases[0] ?? null,
        context
      );

      const existingCase = context.openCareCases[0];
      const careCase = applyCaseFormulation(
        existingCase?.id ?? null,
        formulation,
        {
          familyId: context.familyId,
          elderId: elder_id,
          caregiverId: user_id,
          caseType: depthPlan.caseType ?? situation.situationType,
          summary: situation.explicitNeed || message.slice(0, 100),
        }
      );

      caseUpdate = {
        caseId: careCase.id,
        caseType: careCase.caseType,
        status: careCase.status,
        newFacts: formulation.newKnownFacts,
        newRiskFlags: formulation.newRiskFlags,
        nextSteps: formulation.updatedNextSteps,
      };
    }

    // Build response
    const responseContent = buildDeepCareResponse(situation, depthPlan, probes);

    return NextResponse.json({
      kind: "deepCare",
      content: responseContent,
      situation,
      depth_plan: {
        stage: depthPlan.conversationStage,
        goal: depthPlan.goal,
      },
      probes,
      case_update: caseUpdate,
      suggested_actions: depthPlan.shouldCreateCase
        ? ["创建一个持续关怀案例来跟踪这个情况"]
        : [],
      conversation_state: {
        stage: depthPlan.conversationStage,
        has_case: !!caseUpdate,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function getRedirectHint(kind: string): string {
  switch (kind) {
    case "createTask":
      return "看起来你想创建一个提醒任务呢~去主界面操作就好啦~";
    case "rewriteNote":
      return "看起来你想写一段话给长辈呀~去小纸条功能里弄就好啦~";
    case "querySummary":
      return "你可以在首页查看最近的通话记录和洞察哦~";
    case "addElder":
      return "你可以在设置中添加新的长辈联系人呀~";
    default:
      return "我不太确定你想做什么呢~可以再跟我说说嘛？";
  }
}

function buildSafetyResponse(situation: { riskLevel: string }): string {
  if (situation.riskLevel === "high") {
    return "这个情况听起来比较紧急呢~建议尽快联系家人或专业医生哦~我帮你记下来啦，你也可以创建一个提醒来跟进呀~";
  }
  return "我注意到这个情况值得关注呢~建议你和家人商量一下，必要时联系医生哦~";
}

function buildDeepCareResponse(
  situation: { explicitNeed: string; riskLevel: string },
  depthPlan: { conversationStage: string; goal: string },
  probes: string[]
): string {
  const parts: string[] = [];

  // Acknowledge
  if (situation.explicitNeed) {
    parts.push(`嗯嗯，我理解你的担心呢~`);
  }

  // Add probes
  if (probes.length > 0) {
    parts.push(probes[0]);
  }

  return parts.join("\n");
}
