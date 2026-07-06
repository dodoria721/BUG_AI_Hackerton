import { fetchShips } from "@/backend/ais/ship-source";
import { computeCongestionForecast } from "@/backend/prediction/congestion";
import { computeEnergyDecisions } from "@/backend/prediction/energy-decision";
import { computeSimulationEnergyDecisions } from "@/backend/prediction/simulation-energy";
import { fetchPortCongestion } from "@/backend/portmis/congestion-source";
import { fetchPortCalls } from "@/backend/portmis/portcall-source";
import { BUSAN_PORT } from "@/backend/ports/seed-port";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const [ships, portCalls, portMisCongestion] = await Promise.all([
    fetchShips(),
    fetchPortCalls(),
    fetchPortCongestion(),
  ]);

  const congestion = portMisCongestion ?? computeCongestionForecast(ships, BUSAN_PORT);
  const result = computeEnergyDecisions({
    ships,
    congestion,
    portCalls,
    portConfig: BUSAN_PORT,
  });
  console.info("[energy-decisions]", {
    candidateCount: result.summary.candidateCount,
    recommendedCount: result.summary.recommendedCount,
    etaForecastMatchedCount: result.summary.etaForecastMatchedCount,
    currentLevelFallbackCount: result.summary.currentLevelFallbackCount,
    isForecastStale: result.forecastFreshness.isStale,
  });

  return Response.json({
    ...result,
    isFallback: !portMisCongestion || result.isFallback,
  });
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const simulatedShips =
    body && typeof body === "object" && "simulatedShips" in body
      ? (body as { simulatedShips?: unknown }).simulatedShips
      : [];
  const congestionMode =
    body && typeof body === "object" && "congestionMode" in body
      ? (body as { congestionMode?: unknown }).congestionMode
      : undefined;

  const [portCalls, portMisCongestion] = await Promise.all([
    fetchPortCalls(),
    fetchPortCongestion(),
  ]);

  const congestion = portMisCongestion ?? computeCongestionForecast([], BUSAN_PORT);
  const result = computeSimulationEnergyDecisions({
    simulatedShips,
    congestionMode,
    congestion,
    portCalls,
    portConfig: BUSAN_PORT,
  });

  console.info("[energy-decisions:simulation]", {
    candidateCount: result.summary.candidateCount,
    recommendedCount: result.summary.recommendedCount,
    acceptedCount: result.validation.acceptedCount,
    rejectedCount: result.validation.rejectedCount,
    isForecastStale: result.forecastFreshness.isStale,
  });

  return Response.json({
    ...result,
    isFallback: !portMisCongestion || result.isFallback,
  });
}
