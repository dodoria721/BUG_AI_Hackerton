import assert from "node:assert/strict";
import { BUSAN_PORT } from "../ports/seed-port";
import { congestionLevel, estimateWaitingHours, waitingHoursFromInPort } from "./waiting";
import { recommendSpeed } from "./speed-advisory";
import { seaFuelRate, voyageFuelTon } from "./fuel";

// ── 혼잡도 정규화: 실측 P99가 분모 ──
assert.equal(congestionLevel(367, BUSAN_PORT, "portWide"), 1); // P99에서 정확히 1.0
assert.ok(congestionLevel(300, BUSAN_PORT, "portWide") < 1); // 평시(P50)는 1 미만

// ── 대기시간: onset 이하는 0, 혼잡할수록 증가 ──
assert.equal(estimateWaitingHours(0.5, "풀컨테이너선", BUSAN_PORT), 0); // onset(0.7) 이하
const wMid = estimateWaitingHours(0.9, "풀컨테이너선", BUSAN_PORT);
const wHigh = estimateWaitingHours(1.0, "풀컨테이너선", BUSAN_PORT);
assert.ok(wHigh > wMid && wMid > 0);
// 탱커는 대기 보정이 더 크다(commercial waiting 꼬리)
assert.ok(estimateWaitingHours(1.0, "석유제품 운반선", BUSAN_PORT) > wHigh);

// ── 항해연료: v³ 법칙(감속하면 시간당 연료가 제곱 이상으로 감소) ──
const f20 = seaFuelRate("풀컨테이너선", 90000, 20).tonPerHour;
const f10 = seaFuelRate("풀컨테이너선", 90000, 10).tonPerHour;
assert.ok(Math.abs(f20 / f10 - 8) < 0.01); // (20/10)^3 = 8

// 거리 고정 시 총 항해연료는 v²에 비례(감속 이득의 핵심)
const trip20 = voyageFuelTon("풀컨테이너선", 90000, 200, 20);
const trip10 = voyageFuelTon("풀컨테이너선", 90000, 200, 10);
assert.ok(Math.abs(trip20 / trip10 - 4) < 0.02); // (20/10)^2 = 4

// ── 감속 권고: 한산=감속 없음, 혼잡=감속+절감>0 ──
const calm = recommendSpeed(
  { vesselType: "풀컨테이너선", grossTonnage: 90000, distanceNm: 200, currentSpeedKn: 18, currentInPort: 250 },
  BUSAN_PORT
);
assert.equal(calm.waitHoursIfFullSpeed, 0);
assert.equal(calm.savings.fuelTon, 0);

const busy = recommendSpeed(
  { vesselType: "풀컨테이너선", grossTonnage: 90000, distanceNm: 200, currentSpeedKn: 20, currentInPort: 380 },
  BUSAN_PORT
);
assert.ok(busy.recommendedSpeedKn < 20); // 감속
assert.ok(busy.savings.fuelTon > 0 && busy.savings.co2Ton > 0);
assert.ok(busy.savings.fuelCostUsd > 0);

// currentInPort → 대기시간 헬퍼
const wf = waitingHoursFromInPort(380, "풀컨테이너선", BUSAN_PORT, "portWide");
assert.ok(wf.level > 1 && wf.waitHours > 0);

console.log("speed advisory validation passed");
