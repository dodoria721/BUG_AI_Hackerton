// 선박별 접안(정박) 중 연료소비·탄소배출 추정 — ML 없이 결정론적.
//
// 두 구성요소의 신뢰도가 다르다는 점을 결과에 명시한다:
//   1) 연료소비량(fuelConsumptionTon) — fuel.ts hotelingFuelRate()를 그대로 재사용한다.
//      그 파일 주석에 이미 명시돼 있듯 "IMO Fourth GHG Study 2020 Table 17(보조엔진)·
//      Table 18(보일러)의 berth/anchor 단계 출력을 축약한 근사치"다. 이번 세션에서 원본
//      Table 17/18 수치를 직접 확보하려 시도했으나(IMO 공식 PDF 다운로드 손상·타임아웃 반복,
//      미러 사이트 접근 차단, 2차 인용 논문 페이월) 검증된 정밀표로 교체하지 못했다 — 확인
//      안 된 숫자를 새로 지어내는 대신 기존의 정직하게 라벨된 근사치를 그대로 쓴다. 정밀표를
//      확보하면 fuel.ts의 HOTELING_POWER_KW 상수만 교체하면 이 모델도 자동으로 갱신된다.
//   2) CO2eq 배출계수 — 연료소비량과 달리 이 부분은 실측 국제표준이다. IMO Resolution
//      MEPC.376(80) "Guidelines on Life Cycle GHG Intensity of Marine Fuels" Appendix 2의
//      실측 WtT+TtW 계수(imo-net-zero-levy.ts computeCo2eqTon(), CH4·N2O GWP100 포함)를
//      그대로 재사용한다. 기존 carbon-port-due.ts/port-call-cost.ts가 쓰는 fuel.ts의
//      CO2_FACTOR_TON은 TtW의 CO2 단일가스만 반영(상류 WtT 배출·CH4·N2O 미포함)이라, 이
//      모델이 제공하는 WtW CO2eq가 그보다 완전한 국제표준 수치다.
//   LNG는 imo-net-zero-levy.ts와 같은 이유(IMO가 화석 LNG의 WtT 계수를 아직 확정하지 않음)로
//   WtW 계산에서 제외하고, fuel.ts의 TtW 전용 CO2_FACTOR_TON으로 대체 계산한 뒤 그 사실을
//   결과의 emissionBasis/note에 명시한다(임의로 WtW인 척하지 않는다).

import { CO2_FACTOR_TON, hotelingFuelRate, type FuelType } from "./fuel";
import { computeCo2eqTon, type ImoNzfFuelType } from "./imo-net-zero-levy";

export interface BerthEmissionEstimateInput {
  vesselType?: string; // 선종명(Port-MIS vsslKndNm)
  grossTonnage?: number; // 총톤수
  berthHours: number; // 접안(정박) 시간
}

// WtW(Well-to-Wake, 상류+연소 전체, CH4/N2O GWP100 포함): IMO MEPC.376(80) 실측치.
// ttw-co2-only(연소 CO2 단일가스만): LNG 한정, WtT 상류배출·CH4·N2O 미포함.
export type BerthEmissionBasis = "wtw-gwp100" | "ttw-co2-only";

export interface BerthEmissionEstimate {
  vesselType?: string;
  grossTonnage?: number;
  berthHours: number;
  fuelType: FuelType;
  fuelConsumptionTon: number; // 근사치(출처: fuel.ts hotelingFuelRate, IMO Fourth GHG Study 근사)
  fuelConsumptionConfidence: "approximate"; // 연료소비량은 항상 근사치임을 명시(정밀표 미확보)
  co2eqTon: number; // emissionBasis에 따라 WtW CO2eq 또는 TtW CO2
  emissionBasis: BerthEmissionBasis;
  note: string;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 선박(선종·총톤수)의 접안 시간 동안 연료소비량과 CO2eq 배출량을 추정한다.
 * 연료소비량은 fuel.ts의 기존 근사 모델을, 배출계수는 IMO 실측 WtW 계수를 재사용한다.
 */
export function estimateBerthEmission(input: BerthEmissionEstimateInput): BerthEmissionEstimate {
  const berthHours = Math.max(0, input.berthHours);
  const hotel = hotelingFuelRate(input.vesselType, input.grossTonnage);
  const fuelConsumptionTon = hotel.ratePerHourTon * berthHours;

  let co2eqTon: number;
  let emissionBasis: BerthEmissionBasis;
  if (hotel.fuelType === "LNG") {
    // LNG는 IMO WtT 계수가 아직 미확정이라(imo-net-zero-levy.ts 참고) WtW를 계산하지 않고
    // fuel.ts의 TtW 전용 CO2 계수로 대체한다 — 실측치이나 상류배출·CH4·N2O는 빠진 값이다.
    co2eqTon = fuelConsumptionTon * CO2_FACTOR_TON.LNG;
    emissionBasis = "ttw-co2-only";
  } else {
    co2eqTon = computeCo2eqTon(hotel.fuelType as ImoNzfFuelType, fuelConsumptionTon);
    emissionBasis = "wtw-gwp100";
  }

  const note =
    emissionBasis === "wtw-gwp100"
      ? `연료소비 ${round(fuelConsumptionTon, 2)}t(근사치, 정박 출력 추정 기반) × WtW CO2eq 배출계수(IMO MEPC.376(80), CH4·N2O 포함 GWP100) = ${round(co2eqTon, 2)}tCO2eq`
      : `연료소비 ${round(fuelConsumptionTon, 2)}t(근사치) × TtW CO2 단일계수(LNG, WtT 상류배출·CH4·N2O 미포함) = ${round(co2eqTon, 2)}tCO2`;

  return {
    ...(input.vesselType ? { vesselType: input.vesselType } : {}),
    ...(input.grossTonnage != null ? { grossTonnage: input.grossTonnage } : {}),
    berthHours: round(berthHours, 1),
    fuelType: hotel.fuelType,
    fuelConsumptionTon: round(fuelConsumptionTon, 3),
    fuelConsumptionConfidence: "approximate",
    co2eqTon: round(co2eqTon, 2),
    emissionBasis,
    note,
  };
}
