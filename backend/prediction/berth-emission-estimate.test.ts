import assert from "node:assert/strict";
import { hotelingFuelRate, CO2_FACTOR_TON } from "./fuel";
import { computeCo2eqTon } from "./imo-net-zero-levy";
import { BERTH_EMISSION_DISCLAIMER, estimateBerthEmission } from "./berth-emission-estimate";

// ── 1) 연료소비량은 fuel.ts hotelingFuelRate와 정확히 일치(재사용 확인) ──
{
  const r = estimateBerthEmission({ vesselType: "컨테이너선", grossTonnage: 50000, berthHours: 24 });
  const hotel = hotelingFuelRate("컨테이너선", 50000);
  assert.ok(Math.abs(r.fuelConsumptionTon - hotel.ratePerHourTon * 24) < 0.001, "연료소비량 = fuel.ts 기존 모델 재사용");
  assert.equal(r.fuelConsumptionConfidence, "approximate", "연료소비량은 항상 근사치로 표시");
}

// ── 2) 화석연료(MGO/VLSFO)는 WtW CO2eq를 쓰고, imo-net-zero-levy의 computeCo2eqTon과 일치 ──
{
  const r = estimateBerthEmission({ vesselType: "탱커", grossTonnage: 40000, berthHours: 24 });
  assert.equal(r.emissionBasis, "wtw-gwp100");
  const hotel = hotelingFuelRate("탱커", 40000);
  assert.notEqual(hotel.fuelType, "LNG");
  const expected = computeCo2eqTon(hotel.fuelType as "MGO" | "VLSFO", r.fuelConsumptionTon);
  assert.ok(Math.abs(r.co2eqTon - expected) < 0.01, "WtW CO2eq 재계산 일치");
}

// ── 3) LNG는 TtW 단일계수(CO2_FACTOR_TON.LNG)로 대체 계산되고 그 사실이 emissionBasis에 표시됨 ──
{
  const r = estimateBerthEmission({ vesselType: "LNG운반선", grossTonnage: 90000, berthHours: 24 });
  assert.equal(r.fuelType, "LNG");
  assert.equal(r.emissionBasis, "ttw-co2-only", "LNG는 WtW 대신 TtW 단일계수 사용이 명시됨");
  const expected = r.fuelConsumptionTon * CO2_FACTOR_TON.LNG;
  assert.ok(Math.abs(r.co2eqTon - expected) < 0.01);
}

// ── 4) WtW(MGO/VLSFO)가 TtW-only(LNG 대체계산) 방식보다 큰 게 자연스럽다(WtT 상류배출·CH4·N2O 포함) ──
// 같은 연료소비량 가정하에 WtW 배출계수가 TtW-only보다 반드시 커야 한다는 걸 직접 비교(근사 배제).
{
  const wtwPerTon = computeCo2eqTon("MGO", 1); // 1톤당 WtW CO2eq
  const ttwOnlyPerTon = CO2_FACTOR_TON.MGO; // 1톤당 TtW CO2 단일계수
  assert.ok(wtwPerTon > ttwOnlyPerTon, "WtW(상류+CH4/N2O 포함)가 TtW 단일계수보다 커야 함");
}

// ── 5) 접안시간·총톤수에 비례해 배출량이 커진다 ──
{
  const short = estimateBerthEmission({ vesselType: "컨테이너선", grossTonnage: 50000, berthHours: 10 });
  const long = estimateBerthEmission({ vesselType: "컨테이너선", grossTonnage: 50000, berthHours: 40 });
  assert.ok(long.co2eqTon > short.co2eqTon, "접안시간 길수록 배출량 큼");

  const small = estimateBerthEmission({ vesselType: "컨테이너선", grossTonnage: 15000, berthHours: 24 });
  const large = estimateBerthEmission({ vesselType: "컨테이너선", grossTonnage: 90000, berthHours: 24 });
  assert.ok(large.co2eqTon > small.co2eqTon, "총톤수 클수록 배출량 큼");
}

// ── 6) 결과에는 항상 disclaimer가 채워진다(호출부가 빼먹을 수 없게) — LNG·화석연료 모두 확인 ──
{
  const fossil = estimateBerthEmission({ vesselType: "컨테이너선", grossTonnage: 50000, berthHours: 24 });
  const lng = estimateBerthEmission({ vesselType: "LNG운반선", grossTonnage: 90000, berthHours: 24 });
  assert.equal(fossil.disclaimer, BERTH_EMISSION_DISCLAIMER, "화석연료 케이스도 disclaimer 포함");
  assert.equal(lng.disclaimer, BERTH_EMISSION_DISCLAIMER, "LNG 케이스도 disclaimer 포함");
  assert.ok(fossil.disclaimer.includes("근사치"), "disclaimer가 근사치임을 명시");
  assert.ok(fossil.disclaimer.length > 0);
}

console.log("berth-emission-estimate validation passed");
