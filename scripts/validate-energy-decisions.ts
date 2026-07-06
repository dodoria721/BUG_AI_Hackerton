import assert from "node:assert/strict";
import { computeEnergyDecisions, type EnergyDecisionResult } from "../backend/prediction/energy-decision";
import { computeSimulationEnergyDecisions } from "../backend/prediction/simulation-energy";
import { BUSAN_PORT } from "../backend/ports/seed-port";
import type { CongestionForecast, PortCall, RegionCongestionSeries, Ship } from "../backend/ports/port-types";

const now = new Date("2026-07-04T00:00:00.000Z");

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    mmsi: "368680000",
    name: "PRESIDENT REAGAN",
    lat: 35.05,
    lon: 128.08,
    sog: 10,
    cog: 90,
    eta: now.toISOString(),
    status: "underway",
    imo: "9938341",
    grossTonnage: 59052,
    ...overrides,
  };
}

function congestion(levelAtEta = 0.9): CongestionForecast {
  return {
    port: BUSAN_PORT.name,
    currentLevel: 0.2,
    source: "port-mis",
    basis: "port-mis-arrivals-and-current-in-port",
    lastUpdated: now.toISOString(),
    forecast: [
      { time: "2026-07-04T00:00:00.000Z", level: 0.2, currentInPort: 120 },
      { time: "2026-07-04T01:00:00.000Z", level: 0.2, currentInPort: 120 },
      { time: "2026-07-04T02:00:00.000Z", level: 0.2, currentInPort: 120 },
      { time: "2026-07-04T03:00:00.000Z", level: 0.2, currentInPort: 120 },
      { time: "2026-07-04T04:00:00.000Z", level: levelAtEta, currentInPort: 120 },
      { time: "2026-07-04T05:00:00.000Z", level: 0.4, currentInPort: 120 },
    ],
  };
}

function regionalCongestion(overrides: Record<string, number> = {}): RegionCongestionSeries[] {
  return BUSAN_PORT.congestionRegions.map((region) => ({
    id: region.id,
    name: region.name,
    currentLevel: overrides[region.id] ?? 0.2,
    forecast: [],
    arrivals: 0,
    departures: 0,
    activityWindowHours: 24,
    currentVessels: 0,
    aisSeparable: region.aisSeparable,
    source: "test-regional",
  }));
}

const portCalls: PortCall[] = [
  {
    callSign: "TEST",
    vesselName: "PRESIDENT REAGAN",
    vesselType: "컨테이너선",
    event: "입항" as PortCall["event"],
    grossTonnage: 59052,
  },
];

const forecastResult = computeEnergyDecisions({
  ships: [ship({ callSign: "TEST" })],
  congestion: congestion(0.9),
  portCalls,
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(forecastResult.source, "deterministic-jit");
assert.equal(forecastResult.summary.candidateCount, 1);
assert.equal(forecastResult.summary.recommendedCount, 1);
assert.equal(forecastResult.summary.etaForecastMatchedCount, 1);
assert.equal(forecastResult.summary.currentLevelFallbackCount, 0);
assert.equal(forecastResult.forecastFreshness.isStale, false);
assert.equal(forecastResult.decisions[0].congestionBasis, "eta-forecast-bucket");
assert.equal(forecastResult.decisions[0].currentCongestionLevel, 0.9);
assert.ok(forecastResult.decisions[0].recommendedSpeedKn < forecastResult.decisions[0].currentSpeedKn);
assert.equal(forecastResult.decisions[0].sizeClass, "large");
assert.equal(forecastResult.decisions[0].normalizedVesselType, "container");

const fallbackResult = computeEnergyDecisions({
  ships: [ship({ lon: 127.4 })],
  congestion: { ...congestion(0.2), currentLevel: 0.9, forecast: [] },
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(fallbackResult.summary.recommendedCount, 1);
assert.equal(fallbackResult.summary.currentLevelFallbackCount, 1);
assert.equal(fallbackResult.forecastFreshness.isStale, true);
assert.equal(fallbackResult.decisions[0].congestionBasis, "current-level-fallback");
assert.equal(fallbackResult.decisions[0].currentInPortBasis, "level-times-p99");

const minSpeedResult = computeEnergyDecisions({
  ships: [ship({ lon: 128.86, sog: 20, mmsi: "440043440", imo: "9622722", grossTonnage: 1002 })],
  congestion: {
    ...congestion(1.1),
    forecast: [{ time: "2026-07-04T00:00:00.000Z", level: 1.1, currentInPort: 400 }],
  },
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(minSpeedResult.summary.recommendedCount, 1);
assert.equal(minSpeedResult.decisions[0].minSpeedApplied, true);
assert.ok(minSpeedResult.decisions[0].residualWaitMinutes > 0);

const decision = forecastResult.decisions[0];
assert.equal(decision.fuelType, "HFO");
assert.equal(decision.fuelTypeInferred, true);
assert.equal(decision.estimatedCo2ReducedKg, Math.round(decision.estimatedFuelSavedKg * decision.co2Factor));

function sum(result: EnergyDecisionResult): number {
  return result.decisions.reduce((acc, item) => acc + item.estimatedFuelSavedKg, 0);
}

assert.equal(forecastResult.summary.totalEstimatedFuelSavedKg, sum(forecastResult));

const noCandidateResult = computeEnergyDecisions({
  ships: [ship({ status: "moored", sog: 0 })],
  congestion: congestion(0.9),
  portCalls,
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(noCandidateResult.summary.candidateCount, 0);
assert.equal(noCandidateResult.summary.recommendedCount, 0);
assert.equal(noCandidateResult.emptyReason?.code, "NO_UNDERWAY_CANDIDATES");

const freshLowCongestionResult = computeEnergyDecisions({
  ships: [ship()],
  congestion: congestion(0.2),
  portCalls,
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(freshLowCongestionResult.summary.candidateCount, 1);
assert.equal(freshLowCongestionResult.summary.recommendedCount, 0);
assert.equal(freshLowCongestionResult.summary.etaForecastMatchedCount, 1);
assert.equal(freshLowCongestionResult.summary.lowCongestionSkippedCount, 1);
assert.equal(freshLowCongestionResult.emptyReason?.code, "LOW_CONGESTION_OR_NO_WAIT");

const staleLowFallbackResult = computeEnergyDecisions({
  ships: [ship()],
  congestion: { ...congestion(0.2), currentLevel: 0.2 },
  portCalls,
  portConfig: BUSAN_PORT,
  now: new Date("2026-07-06T00:00:00.000Z"),
});

assert.equal(staleLowFallbackResult.summary.candidateCount, 1);
assert.equal(staleLowFallbackResult.summary.recommendedCount, 0);
assert.equal(staleLowFallbackResult.summary.currentLevelFallbackCount, 1);
assert.equal(staleLowFallbackResult.forecastFreshness.isStale, true);
assert.equal(staleLowFallbackResult.emptyReason?.code, "STALE_FORECAST_LOW_FALLBACK_CONGESTION");

const simulationResult = computeSimulationEnergyDecisions({
  simulatedShips: [
    {
      id: "sim-001",
      name: "SIM CONTAINER 01",
      lat: 35.05,
      lng: 128.08,
      sog: 10,
      status: "underway",
      vesselType: "container",
      grossTonnage: 80000,
      source: "simulation",
    },
  ],
  congestion: congestion(0.9),
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
  congestionMode: "eta-forecast",
});

assert.equal(simulationResult.mode, "simulation");
assert.equal(simulationResult.basis, "jit-arrival-simulation");
assert.equal(simulationResult.congestionMode, "eta-forecast");
assert.equal(simulationResult.validation.acceptedCount, 1);
assert.equal(simulationResult.validation.rejectedCount, 0);
assert.equal(simulationResult.summary.candidateCount, 1);
assert.equal(simulationResult.summary.recommendedCount, 1);
assert.equal(simulationResult.decisions[0].shipId, "sim-001");
assert.equal(simulationResult.decisions[0].source, "simulation");
assert.equal(simulationResult.decisions[0].isSimulated, true);
assert.equal(simulationResult.decisions[0].destinationPortId, "busan-north");
assert.equal(simulationResult.decisions[0].destinationPortName, "부산항 북항");
assert.equal(simulationResult.decisions[0].grossTonnage, 80000);
assert.equal(simulationResult.decisions[0].normalizedVesselType, "container");
assert.equal(simulationResult.decisions[0].fuelConsumptionKgPerHour, 360);
assert.ok(!simulationResult.decisions[0].mmsi);

const dashboardCurrentSimulationResult = computeSimulationEnergyDecisions({
  simulatedShips: [
    {
      id: "sim-near-port",
      name: "SIM NEAR PORT",
      lat: 35.05,
      lng: 128.98,
      sog: 10,
      status: "underway",
      vesselType: "container",
      grossTonnage: 80000,
      source: "simulation",
    },
  ],
  congestion: { ...congestion(0.2), currentLevel: 0.9, forecast: [] },
  regionalCongestion: regionalCongestion({ busan: 0.9 }),
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(dashboardCurrentSimulationResult.mode, "simulation");
assert.equal(dashboardCurrentSimulationResult.congestionMode, "dashboard-current");
assert.equal(dashboardCurrentSimulationResult.basis, "jit-arrival-simulation-destination-congestion");
assert.equal(dashboardCurrentSimulationResult.destinationCongestion?.["busan-north"].level, 0.9);
assert.equal(dashboardCurrentSimulationResult.destinationCongestion?.["busan-north"].status, "혼잡");
assert.equal(dashboardCurrentSimulationResult.summary.candidateCount, 1);
assert.equal(dashboardCurrentSimulationResult.summary.recommendedCount, 1);
assert.equal(dashboardCurrentSimulationResult.summary.etaForecastMatchedCount, 0);
assert.equal(dashboardCurrentSimulationResult.summary.currentLevelFallbackCount, 0);
assert.equal(dashboardCurrentSimulationResult.forecastFreshness.isStale, false);
assert.equal(dashboardCurrentSimulationResult.decisions[0].congestionBasis, "destination-current-level");
assert.equal(dashboardCurrentSimulationResult.decisions[0].currentCongestionLevel, 0.9);
assert.ok(dashboardCurrentSimulationResult.decisions[0].distanceNm < 10);
assert.ok(
  dashboardCurrentSimulationResult.decisions[0].reasons.some((reason) =>
    reason.includes("부산항과 가까운 위치라 JIT 감속 효과가 제한적일 수 있습니다.")
  )
);
assert.equal(dashboardCurrentSimulationResult.summary.byDestination?.[0].destinationPortId, "busan-north");

const multiDestinationResult = computeSimulationEnergyDecisions({
  simulatedShips: [
    {
      id: "sim-new",
      name: "SIM NEW PORT",
      lat: 35.05,
      lng: 128.82,
      sog: 12,
      status: "underway",
      vesselType: "container",
      grossTonnage: 80000,
      destinationPortId: "busan-new",
      source: "simulation",
    },
    {
      id: "sim-gamcheon",
      name: "SIM GAMCHEON",
      lat: 35.05,
      lng: 128.82,
      sog: 12,
      status: "underway",
      vesselType: "container",
      grossTonnage: 80000,
      destinationPortId: "gamcheon",
      source: "simulation",
    },
  ],
  congestion: { ...congestion(0.2), currentLevel: 0.2, forecast: [] },
  regionalCongestion: regionalCongestion({ sinhang: 0.9, gamcheon: 0.6 }),
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(multiDestinationResult.summary.candidateCount, 2);
assert.equal(multiDestinationResult.decisions.length, 2);
const newPortDecision = multiDestinationResult.decisions.find((item) => item.shipId === "sim-new");
const gamcheonDecision = multiDestinationResult.decisions.find((item) => item.shipId === "sim-gamcheon");
assert.ok(newPortDecision);
assert.ok(gamcheonDecision);
assert.equal(newPortDecision.destinationPortId, "busan-new");
assert.equal(newPortDecision.destinationPortName, "부산신항");
assert.equal(newPortDecision.congestionBasis, "destination-current-level");
assert.equal(newPortDecision.currentCongestionLevel, 0.9);
assert.equal(gamcheonDecision.destinationPortId, "gamcheon");
assert.equal(gamcheonDecision.destinationPortName, "감천항");
assert.equal(gamcheonDecision.currentCongestionLevel, 0.6);
assert.notEqual(newPortDecision.distanceNm, gamcheonDecision.distanceNm);
assert.equal(multiDestinationResult.summary.byDestination?.length, 2);

const emptySimulationResult = computeSimulationEnergyDecisions({
  simulatedShips: [],
  congestion: congestion(0.9),
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(emptySimulationResult.validation.acceptedCount, 0);
assert.equal(emptySimulationResult.summary.candidateCount, 0);
assert.equal(emptySimulationResult.summary.recommendedCount, 0);

const invalidSimulationResult = computeSimulationEnergyDecisions({
  simulatedShips: [
    {
      id: "bad-sim",
      name: "BAD SIM",
      lat: 500,
      lng: 128.08,
      sog: 10,
      status: "underway",
      vesselType: "container",
      grossTonnage: 80000,
      source: "simulation",
    },
  ],
  congestion: congestion(0.9),
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(invalidSimulationResult.validation.acceptedCount, 0);
assert.equal(invalidSimulationResult.validation.rejectedCount, 1);
assert.equal(invalidSimulationResult.summary.recommendedCount, 0);

const invalidDestinationResult = computeSimulationEnergyDecisions({
  simulatedShips: [
    {
      id: "bad-destination",
      name: "BAD DESTINATION",
      lat: 35.05,
      lng: 128.9,
      sog: 12,
      status: "underway",
      vesselType: "container",
      grossTonnage: 80000,
      destinationPortId: "unknown-port",
      source: "simulation",
    },
  ],
  congestion: congestion(0.9),
  portCalls: [],
  portConfig: BUSAN_PORT,
  now,
});

assert.equal(invalidDestinationResult.validation.acceptedCount, 0);
assert.equal(invalidDestinationResult.validation.rejectedCount, 1);

console.log("energy decision validation passed");
