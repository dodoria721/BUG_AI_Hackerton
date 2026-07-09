import {
  generateRouteScenarioAdvisor,
  type RouteScenarioAdvisorResult,
} from "@/backend/advisor/route-scenario-advisor";
import { resolveRegionalCongestion } from "@/backend/congestion/regional-congestion";
import { computeCongestionForecast } from "@/backend/prediction/congestion";
import {
  computeRouteScenarioRecommendations,
  type RouteScenarioComputationResult,
  type RouteScenarioShipResult,
} from "@/backend/prediction/routes/route-recommendation";
import { normalizeSimulatedShipsForDecision, type SimulationValidation } from "@/backend/prediction/simulation-energy";
import { fetchPortCongestion } from "@/backend/portmis/congestion-source";
import { fetchPortCalls } from "@/backend/portmis/portcall-source";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import type { EnergyDecisionCongestionMode } from "@/backend/prediction/energy-decision";
import { fetchSeaRiskAssessment } from "@/backend/marine/sea-risk-source";
import { fetchActiveTyphoons } from "@/backend/marine/typhoon";

export interface RouteScenarioRequest {
  mode?: unknown;
  congestionMode?: unknown;
  scenarioShips?: unknown;
}

export interface AdvisedRouteScenarioShipResult extends RouteScenarioShipResult {
  advisor: RouteScenarioAdvisorResult;
}

export interface RouteScenarioServiceResult extends Omit<RouteScenarioComputationResult, "results"> {
  advisorSource: RouteScenarioAdvisorResult["source"];
  results: AdvisedRouteScenarioShipResult[];
  isFallback: boolean;
  dataSources: string[];
  validation: SimulationValidation;
  invalidShips?: SimulationValidation["issues"];
}

function normalizeCongestionMode(value: unknown): EnergyDecisionCongestionMode {
  return value === "eta-forecast" ? "eta-forecast" : "dashboard-current";
}

// AI 계산 경로가 회피할 활성 태풍 목록. API 미설정/오류는 "태풍 없음"으로 안전하게 처리한다
// (이 값이 없어도 나머지 경로 추천 전체가 실패해선 안 된다).
async function fetchActiveTyphoonsSafely() {
  try {
    return (await fetchActiveTyphoons()) ?? [];
  } catch (err) {
    console.warn("[route-scenarios] 태풍정보 조회 실패, 태풍 없음으로 처리:", err);
    return [];
  }
}

export async function getRouteScenarios(input: RouteScenarioRequest): Promise<RouteScenarioServiceResult> {
  const [portCalls, portMisCongestion, regionalCongestion, seaRisk, typhoons] = await Promise.all([
    fetchPortCalls(),
    fetchPortCongestion(),
    resolveRegionalCongestion(BUSAN_PORT),
    fetchSeaRiskAssessment(),
    fetchActiveTyphoonsSafely(),
  ]);
  const congestion = portMisCongestion ?? computeCongestionForecast([], BUSAN_PORT);
  const { ships, validation } = normalizeSimulatedShipsForDecision(input.scenarioShips ?? [], BUSAN_PORT);
  const result = computeRouteScenarioRecommendations({
    ships,
    congestion,
    portCalls,
    regionalCongestion,
    portConfig: BUSAN_PORT,
    congestionMode: normalizeCongestionMode(input.congestionMode),
    seaRisk,
    typhoons,
  });
  const results = await Promise.all(
    result.results.map(async (shipResult) => ({
      ...shipResult,
      advisor: await generateRouteScenarioAdvisor(shipResult),
    }))
  );
  const advisorSource: RouteScenarioAdvisorResult["source"] = results.some((item) => item.advisor.source === "openai")
    ? "openai"
    : "rule-based-fallback";

  console.info("[route-scenarios:simulation]", {
    acceptedCount: validation.acceptedCount,
    rejectedCount: validation.rejectedCount,
    shipCount: result.summary.shipCount,
    recommendedCount: result.summary.recommendedCount,
    advisorSource,
  });

  return {
    ...result,
    advisorSource,
    results,
    isFallback: !portMisCongestion,
    dataSources: [
      "scenario-ships",
      portMisCongestion ? "port-mis-congestion" : "congestion-fallback",
      "regional-port-congestion",
      "energy-baseline-data",
      "mof-guideline-route",
      seaRisk.dataAvailable ? "marine-sea-risk" : "sea-risk-unavailable",
      typhoons.length > 0 ? "active-typhoon-avoidance" : "no-active-typhoon",
    ],
    validation,
    ...(validation.issues.length > 0 ? { invalidShips: validation.issues } : {}),
  };
}
