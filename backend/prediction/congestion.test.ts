import assert from "node:assert/strict";
import { BUSAN_PORT } from "../ports/seed-port";
import { computePortCongestion, computePortCongestionBreakdown, inPortPressureFromBands } from "./congestion";

// ── 재고 압력: 실측 분위수 매핑 ──
const cap = BUSAN_PORT.portCallCapacity.portWide;
assert.equal(inPortPressureFromBands(0, BUSAN_PORT), 0);
assert.ok(Math.abs(inPortPressureFromBands(cap.p50, BUSAN_PORT) - 0.5) < 1e-9); // 평시 → 0.5
assert.ok(Math.abs(inPortPressureFromBands(cap.p95, BUSAN_PORT) - 0.95) < 1e-9);
assert.ok(Math.abs(inPortPressureFromBands(cap.p99, BUSAN_PORT) - 0.99) < 1e-9);
assert.equal(inPortPressureFromBands(cap.max, BUSAN_PORT), 1);
assert.equal(inPortPressureFromBands(cap.max + 100, BUSAN_PORT), 1); // 상한 클램프
// 단조 증가
assert.ok(inPortPressureFromBands(320, BUSAN_PORT) > inPortPressureFromBands(300, BUSAN_PORT));
// 옛 방식(항상 ~0.96 붙박이) 대비: 평시(P50)는 0.5 부근이라 판별력이 산다
assert.ok(inPortPressureFromBands(cap.p50, BUSAN_PORT) < 0.6);

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
