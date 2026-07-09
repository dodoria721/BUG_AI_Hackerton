import assert from "node:assert/strict";
import { BUSAN_PORT } from "../ports/seed-port";
import { computeCarbonPortDue } from "./carbon-port-due";

const policy = BUSAN_PORT.portDue;

// ── 1) 정박료 공식: GT/10 × (기본 12h요율 + 초과시간 × 초과요율) — 해수부 고시 구조 그대로 ──
{
  const r = computeCarbonPortDue({ vesselType: "컨테이너선", grossTonnage: 50000, berthHours: 24, isForeignGoing: true }, BUSAN_PORT);
  const units10Ton = 50000 / 10;
  const expectedKrw = units10Ton * policy.foreignGoing.base10TonPer12hKrw + units10Ton * 12 * policy.foreignGoing.excess10TonPer1hKrw;
  assert.equal(r.mooringFeeKrw, Math.round(expectedKrw), "정박료 = 기본료 + 초과시간 가산");
  assert.ok(Math.abs(r.mooringFeeUsdApprox - r.mooringFeeKrw / policy.fxKrwPerUsd) <= 1, "USD 환산 일관");
}

// ── 2) 외항선 요율이 내항선보다 높다(해수부 고시: 187원 > 61원, 15.7원 > 5.2원) ──
{
  const foreign = computeCarbonPortDue({ grossTonnage: 50000, berthHours: 24, isForeignGoing: true }, BUSAN_PORT);
  const coastal = computeCarbonPortDue({ grossTonnage: 50000, berthHours: 24, isForeignGoing: false }, BUSAN_PORT);
  assert.ok(foreign.mooringFeeKrw > coastal.mooringFeeKrw, "외항선 요율이 더 높음");
}

// ── 3) 총톤수 150톤 미만은 정박료 면제(해수부 고시 기준) ──
{
  const r = computeCarbonPortDue({ grossTonnage: 100, berthHours: 24 }, BUSAN_PORT);
  assert.equal(r.mooringFeeKrw, 0, "150톤 미만 면제");
}

// ── 4) 정박 12시간 이내면 초과요금 없음, 12시간 초과분부터 가산 ──
{
  const within12h = computeCarbonPortDue({ grossTonnage: 50000, berthHours: 10 }, BUSAN_PORT);
  const exactly12h = computeCarbonPortDue({ grossTonnage: 50000, berthHours: 12 }, BUSAN_PORT);
  const over12h = computeCarbonPortDue({ grossTonnage: 50000, berthHours: 20 }, BUSAN_PORT);
  assert.equal(within12h.mooringFeeKrw, exactly12h.mooringFeeKrw, "12시간 이내는 기본료로 동일");
  assert.ok(over12h.mooringFeeKrw > exactly12h.mooringFeeKrw, "12시간 초과분은 가산");
}

// ── 5) 탄소 그림자가격: 배출 CO2에 비례, 정박료와는 별도 필드(합산해서 숨기지 않음) ──
{
  const small = computeCarbonPortDue({ vesselType: "컨테이너선", grossTonnage: 20000, berthHours: 24 }, BUSAN_PORT);
  const large = computeCarbonPortDue({ vesselType: "컨테이너선", grossTonnage: 80000, berthHours: 24 }, BUSAN_PORT);
  assert.ok(large.portCallCo2Ton > small.portCallCo2Ton, "큰 배가 더 많이 배출");
  assert.ok(large.carbonShadowCostUsd > small.carbonShadowCostUsd, "배출량 클수록 그림자가격 큼");
  assert.ok(
    Math.abs(small.carbonShadowCostUsd - small.portCallCo2Ton * policy.carbonShadowPriceUsdPerTon) <= 1,
    "그림자가격 = CO2 × 단가"
  );
}

// ── 6) CII 등급은 정보로만 표시되고 금액에 반영되지 않는다(cii.ts와 등급 일치, 금액 독립) ──
{
  const r = computeCarbonPortDue({ vesselType: "벌크선", grossTonnage: 30000, year: 2026 }, BUSAN_PORT);
  // 등급이 뭐든(A~E) mooringFeeKrw·carbonShadowCostUsd 계산식엔 등급 변수가 전혀 개입하지 않는다.
  const sameGtDifferentType = computeCarbonPortDue({ vesselType: "탱커", grossTonnage: 30000, year: 2026 }, BUSAN_PORT);
  assert.equal(r.mooringFeeKrw, sameGtDifferentType.mooringFeeKrw, "정박료는 선종·등급과 무관(GT·시간만 의존)");
  assert.ok(r.ciiGrade === null || ["A", "B", "C", "D", "E"].includes(r.ciiGrade));
}

console.log("carbon-port-due validation passed");
