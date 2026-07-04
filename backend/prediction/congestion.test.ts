import assert from "node:assert/strict";
import { BUSAN_PORT } from "../ports/seed-port";
import { computePortCongestion, computePortCongestionBreakdown } from "./congestion";

const empty = computePortCongestionBreakdown(0, 0, BUSAN_PORT);
assert.equal(empty.level, 0);
assert.equal(empty.arrivalPressure, 0);
assert.equal(empty.inPortPressure, 0);

const inPortOnly = computePortCongestionBreakdown(0, 12, BUSAN_PORT);
assert.ok(inPortOnly.level > 0);
assert.equal(inPortOnly.arrivals, 0);
assert.equal(inPortOnly.currentInPort, 12);

const arrivalsOnly = computePortCongestionBreakdown(BUSAN_PORT.arrivalCapacityPerHour, 0, BUSAN_PORT);
assert.equal(arrivalsOnly.level, 1);

const combined = computePortCongestionBreakdown(3, 12, BUSAN_PORT);
assert.ok(combined.arrivalPressure != null);
assert.ok(combined.inPortPressure != null);
assert.ok(combined.level > combined.arrivalPressure);
assert.ok(combined.level > combined.inPortPressure);

const now = new Date("2026-07-04T00:00:00.000Z");
const forecast = computePortCongestion(
  ["2026-07-04T00:10:00.000Z", "2026-07-04T00:20:00.000Z"],
  BUSAN_PORT,
  now,
  { currentInPortCount: 12 }
);
assert.equal(forecast.source, "port-mis");
assert.equal(forecast.basis, "port-mis-arrivals-and-current-in-port");
assert.ok(forecast.currentLevel > 0);
assert.equal(forecast.forecast[6].arrivals, 2);
assert.equal(forecast.forecast[6].currentInPort, 12);

console.log("port congestion validation passed");
