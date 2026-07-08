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

export async function getRouteScenarios(input: RouteScenarioRequest): Promise<RouteScenarioServiceResult> {
  const [portCalls, portMisCongestion, regionalCongestion] = await Promise.all([
    fetchPortCalls(),
    fetchPortCongestion(),
    resolveRegionalCongestion(BUSAN_PORT),
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
      "manual-simulation-route",
    ],
    validation,
    ...(validation.issues.length > 0 ? { invalidShips: validation.issues } : {}),
  };
}
