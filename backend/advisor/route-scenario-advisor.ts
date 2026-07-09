import { generateText } from "ai";
import { advisorModel } from "@/backend/models";
import type { RouteScenarioShipResult } from "@/backend/prediction/routes/route-recommendation";
import { buildRouteScenarioAdvisorPrompt } from "./route-scenario-prompt";
import {
  parseRouteScenarioAdvisorResult,
  type RouteScenarioAdvisorResult,
} from "./route-scenario-parse";

export type { RouteScenarioAdvisorResult } from "./route-scenario-parse";

const DISCLAIMER = "본 경로 추천은 사전 정의된 접근 경로 후보를 비교한 시뮬레이션 결과이며 실제 항해 지시가 아닙니다.";

export function buildRouteScenarioFallbackAdvisor(result: RouteScenarioShipResult): RouteScenarioAdvisorResult {
  const recommended = result.routeScenarios.find((route) => route.isRecommended);
  const alternatives = result.routeScenarios.filter((route) => !route.isRecommended);

  return {
    source: "rule-based-fallback",
    summary: recommended
      ? `${result.destinationPortName} 기준 계산 결과에서 ${recommended.routeName} 후보가 선정되었습니다.`
      : "계산 결과 기준 추천 경로 후보를 선정할 수 없습니다.",
    recommendation: recommended
      ? `추천 경로는 후보 중 종합 점수가 가장 낮은 ${recommended.routeName}입니다.`
      : "선박 입력값과 도착지 경로 후보를 확인해주세요.",
    comparison: alternatives.length
      ? alternatives.map(
          (route) =>
            `${route.routeName}: 점수 ${route.score}, 거리 ${route.distanceNm}NM, 예상 대기 ${route.estimatedWaitingMinutes}분`
        )
      : ["비교 가능한 대안 경로가 없습니다."],
    reasons: recommended
      ? [
          `MVP 가중 비교 점수 ${recommended.score}로 후보 중 가장 낮습니다.`,
          `거리 ${recommended.distanceNm}NM, 예상 대기 ${recommended.estimatedWaitingMinutes}분, CO2 감축 ${recommended.estimatedCo2ReducedKg}kg 기준으로 비교했습니다.`,
          "모든 수치는 백엔드 결정론적 계산 결과를 그대로 사용했습니다.",
        ]
      : ["추천 경로 계산 결과가 없습니다."],
    risks: [
      ...(recommended && (recommended.seaRisk.grade === "높음" || recommended.seaRisk.grade === "위험")
        ? [
            `해상 리스크 ${recommended.seaRisk.grade}(레벨 ${Math.round(recommended.seaRisk.level * 100)}%) — ${recommended.seaRisk.basis.join(" ")}`,
          ]
        : []),
      "본 결과는 사전 정의된 접근 경로 후보를 비교한 시뮬레이션입니다.",
      "실제 항해 지시가 아니며 관제·도선·예선·기상·수심·선박 안전 조건은 운영자가 확인해야 합니다.",
    ],
    disclaimer: DISCLAIMER,
  };
}

export async function generateRouteScenarioAdvisor(
  result: RouteScenarioShipResult
): Promise<RouteScenarioAdvisorResult> {
  if (!process.env.OPENAI_API_KEY) return buildRouteScenarioFallbackAdvisor(result);

  try {
    const { text } = await generateText({
      model: advisorModel,
      prompt: buildRouteScenarioAdvisorPrompt(result),
    });
    return parseRouteScenarioAdvisorResult(text) ?? buildRouteScenarioFallbackAdvisor(result);
  } catch (error) {
    console.error("[route-scenario-advisor]", error);
    return buildRouteScenarioFallbackAdvisor(result);
  }
}
