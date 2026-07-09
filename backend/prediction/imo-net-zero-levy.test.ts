import assert from "node:assert/strict";
import { computeFuelWtW, computeGfiTargets, computeImoNetZeroLevy } from "./imo-net-zero-levy";

// ── 1) WtW = WtT + TtW, IMO Appendix 2 실측값으로 독립 재계산해 교차검증 ──
// MGO: WtT=17.7, LCV=0.0427, CfCO2=3.206, CfCH4=0.00005, CfN2O=0.00018, GWP(1,28,265)
{
  const wtt = 17.7;
  const ttw = (3.206 * 1 + 0.00005 * 28 + 0.00018 * 265) / 0.0427;
  const expected = wtt + ttw;
  const actual = computeFuelWtW("MGO");
  assert.ok(Math.abs(actual - expected) < 0.01, `MGO WtW 재계산 불일치: ${actual} vs ${expected}`);
  assert.ok(actual > 93 && actual < 95, "MGO WtW는 약 93.9 gCO2eq/MJ 부근이어야 함");
}
// VLSFO: WtT=16.8, LCV=0.0402, CfCO2=3.114
{
  const wtt = 16.8;
  const ttw = (3.114 * 1 + 0.00005 * 28 + 0.00018 * 265) / 0.0402;
  const expected = wtt + ttw;
  const actual = computeFuelWtW("VLSFO");
  assert.ok(Math.abs(actual - expected) < 0.01, `VLSFO WtW 재계산 불일치: ${actual} vs ${expected}`);
  assert.ok(actual > 95 && actual < 96, "VLSFO WtW는 약 95.5 gCO2eq/MJ 부근이어야 함");
}

// ── 2) GFI 목표: 2008 기준선 93.3 대비 감축율로 산출, Direct가 Base보다 항상 엄격(작음) ──
{
  const t2028 = computeGfiTargets(2028)!;
  assert.ok(Math.abs(t2028.baseTarget - 93.3 * 0.96) < 0.01, "2028 Base = 93.3×(1-4%)");
  assert.ok(Math.abs(t2028.directComplianceTarget - 93.3 * 0.83) < 0.01, "2028 Direct = 93.3×(1-17%)");
  assert.ok(t2028.directComplianceTarget < t2028.baseTarget, "Direct Compliance가 Base보다 항상 엄격");

  const t2035 = computeGfiTargets(2035)!;
  assert.ok(t2035.baseTarget < t2028.baseTarget, "연도가 갈수록 목표가 강화(값이 작아짐)");

  assert.equal(computeGfiTargets(2036), null, "2036년 이후는 미확정");
  assert.equal(computeGfiTargets(2027), null, "2027년 이전은 목표 자체가 없음");
}

// ── 3) 적용대상 판정: 5,000GT 미만 제외, 목표 미확정 연도 제외 ──
{
  const small = computeImoNetZeroLevy({ fuelType: "MGO", fuelConsumptionTon: 1000, grossTonnage: 3000, year: 2028 });
  assert.equal(small.applicable, false, "5,000GT 미만은 적용대상 아님");
  assert.equal(small.totalLevyUsd, null);

  const futureYear = computeImoNetZeroLevy({ fuelType: "MGO", fuelConsumptionTon: 1000, grossTonnage: 50000, year: 2040 });
  assert.equal(futureYear.applicable, false, "목표 미확정 연도는 계산 불가");
}

// ── 4) 화석연료(MGO/VLSFO)는 2028년 목표를 크게 초과 → Tier1+Tier2 모두 발생(실제 규정 의도와 일치:
//     대체연료 없는 재래식 선박은 초기부터 Tier2 위반이 되도록 설계됨) ──
{
  const r = computeImoNetZeroLevy({ fuelType: "MGO", fuelConsumptionTon: 1000, grossTonnage: 50000, year: 2028 });
  assert.equal(r.applicable, true);
  assert.ok(r.attainedGfi! > r.targets!.baseTarget, "재래식 연료는 2028 Base Target도 초과");
  assert.ok(r.tier1DeficitTon! > 0 && r.tier2DeficitTon! > 0, "Tier1·Tier2 부족분 모두 발생");
  assert.equal(r.priceKnown, true, "2028년은 요금 확정 기간");
  assert.ok(Math.abs(r.totalLevyUsd! - (r.tier1LevyUsd! + r.tier2LevyUsd!)) < 1, "총액 = Tier1+Tier2");
  // 개별 재계산: tier1Usd = tier1Ton×100, tier2Usd = tier2Ton×380 (반올림된 톤수 재곱이라 느슨한 허용오차)
  assert.ok(Math.abs(r.tier1LevyUsd! - r.tier1DeficitTon! * 100) < 5);
  assert.ok(Math.abs(r.tier2LevyUsd! - r.tier2DeficitTon! * 380) < 5);
}

// ── 5) 연료 소비량에 비례해 부족톤수·부담금이 커진다 ──
{
  const small = computeImoNetZeroLevy({ fuelType: "VLSFO", fuelConsumptionTon: 500, grossTonnage: 50000, year: 2028 });
  const large = computeImoNetZeroLevy({ fuelType: "VLSFO", fuelConsumptionTon: 2000, grossTonnage: 50000, year: 2028 });
  assert.ok(large.totalLevyUsd! > small.totalLevyUsd!, "연료 소비량 클수록 부담금 큼");
  assert.ok(Math.abs(large.totalLevyUsd! / small.totalLevyUsd! - 4) < 0.05, "연료량 4배 → 부담금도 약 4배(선형)");
}

// ── 6) 2031년 이후: 목표는 있으나 Remedial Unit 가격 미확정 → 톤수는 나오되 금액은 null ──
{
  const r = computeImoNetZeroLevy({ fuelType: "MGO", fuelConsumptionTon: 1000, grossTonnage: 50000, year: 2031 });
  assert.equal(r.applicable, true);
  assert.equal(r.priceKnown, false, "2031년은 가격 미확정");
  assert.ok(r.tier1DeficitTon != null && r.tier2DeficitTon != null, "부족톤수는 계산됨");
  assert.equal(r.totalLevyUsd, null, "가격 미확정이라 금액은 null");
  assert.equal(r.tier1LevyUsd, null);
  assert.equal(r.tier2LevyUsd, null);
}

console.log("imo-net-zero-levy validation passed");
