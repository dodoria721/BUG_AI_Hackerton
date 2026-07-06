import assert from "node:assert/strict";
import { computeEnergyDecisions, type EnergyDecisionResult } from "../backend/prediction/energy-decision";
import { BUSAN_PORT } from "../backend/ports/seed-port";
import type { CongestionForecast, PortCall, Ship } from "../backend/ports/port-types";

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

console.log("energy decision validation passed");
