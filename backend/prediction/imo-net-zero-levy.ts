// IMO Net-Zero Framework(NZF) 탄소부담금 — 2027-03-01 발효, 2028년 이행연도부터 실부과.
// MEPC 83(2025-04)에서 승인, MARPOL Annex VI 신설 Chapter 5로 편입되는 실제 국제규정이다.
// ML 없이 결정론적. 부산항 고유 정책이 아니라 전 세계 공통 규정이라 seed-port.ts가 아니라
// 여기(국제규정 상수)에 값을 둔다 — fuel.ts의 EU_ETS와 같은 패턴.
//
// 구조: 선박의 GHG Fuel Intensity(GFI, 연료 1MJ당 온실가스 gCO2eq)가 연도별 목표(Base/Direct
// Compliance Target)를 넘으면 부족분(Remedial Unit)을 구매해야 한다.
//   - GFI ≤ Direct Compliance Target: 미달(부담금 없음, surplus 발생 가능·본 모델은 미다룸)
//   - Direct Compliance Target < GFI ≤ Base Target: Tier 1 부족분 → $100/tCO2eq(2028-2030)
//   - GFI > Base Target: Tier 1 부족분(Direct~Base 구간) + Tier 2 부족분(Base 초과분)
//     → Tier 2는 $380/tCO2eq(2028-2030)
//
// 근거(전부 실측/공식 출처, 교차검증 완료):
//   - GFI 2008 기준선 93.3 gCO2eq/MJ, 연도별 Base/Direct Compliance 감축율(2028~2035):
//     DNV "IMO MEPC 83: GHG requirements approved" + zerocarbonshipping 팩트시트, 두 소스 일치.
//   - Remedial Unit 가격(2028-2030 한정): Tier1 $100/tCO2eq, Tier2 $380/tCO2eq.
//     King & Spalding, DNV, ammoniaenergy.org 등 다수 보도 일치. 2031년 이후 가격은
//     Regulation 36(10)에 따라 MEPC가 추후 결정(아직 미확정 — 본 모델은 톤수까지만 계산).
//   - MGO/VLSFO의 WtT·TtW 배출계수: IMO Resolution MEPC.376(80)
//     "Guidelines on Life Cycle GHG Intensity of Marine Fuels" Appendix 2 실측값
//     (Fourth IMO GHG Study 2020 / Resolution MEPC.364(79) 기반).
//     ※ Cf_CO2 값(MGO 3.206, VLSFO 3.114)이 fuel.ts의 CO2_FACTOR_TON과 정확히 일치 —
//     같은 IMO 출처에서 왔음을 교차 확인.
//   - GWP100(IPCC AR5): CO2=1, CH4=28, N2O=265. 동일 결의문 2.4항에 명시.
//   - 적용대상: 총톤수 5,000톤 이상 국제항해 선박(국제해운 CO2 배출의 약 85% 커버).
//
// ⚠️ LNG는 제외한다. IMO LCA 가이드라인이 화석 LNG의 WtT(상류) 기본계수를 아직 확정하지
//    않았다(가이드라인 부속서에 값 미기재, NZF 이행 전 개정 예정이라고 명시). 확인 안 된
//    값(문헌상 18.5~28 gCO2eq/MJ 추정범위)을 임의로 채우지 않는다.

import type { FuelType } from "./fuel";

export type ImoNzfFuelType = Exclude<FuelType, "LNG">;

interface ImoFuelWtWFactors {
  wttGCo2eqPerMj: number; // Well-to-Tank(상류) — IMO Appendix 2 실측값
  lcvMjPerG: number; // Lower Calorific Value
  cfCo2GPerGFuel: number; // CO2 배출계수(연소, g-CO2/g-연료)
  cfCh4GPerGFuel: number;
  cfN2oGPerGFuel: number;
}

// IMO Resolution MEPC.376(80) Appendix 2 "Initial Default Emission Factors per Fuel Pathway
// Code" 발췌(비생물기원 화석연료, MGO/VLSFO). 원문 Fuel Pathway Code를 주석에 남긴다.
const IMO_FUEL_FACTORS: Record<ImoNzfFuelType, ImoFuelWtWFactors> = {
  // MDO/MGO(ULSFO)_f_SR_gm — ISO 8217 DMX/DMA/DMZ/DMB, S≤0.10%
  MGO: { wttGCo2eqPerMj: 17.7, lcvMjPerG: 0.0427, cfCo2GPerGFuel: 3.206, cfCh4GPerGFuel: 0.00005, cfN2oGPerGFuel: 0.00018 },
  // HFO(VLSFO)_f_SR_gm — ISO 8217 RME/RMG/RMK, 0.10<S≤0.50%
  VLSFO: { wttGCo2eqPerMj: 16.8, lcvMjPerG: 0.0402, cfCo2GPerGFuel: 3.114, cfCh4GPerGFuel: 0.00005, cfN2oGPerGFuel: 0.00018 },
};

// IPCC AR5 100년 GWP — MEPC.376(80) 2.4항 "(CO2 1; CH4 28; N2O 265)" 그대로.
const GWP100 = { CO2: 1, CH4: 28, N2O: 265 };

/**
 * Tank-to-Wake WtW 원단위(gCO2eq/MJ) — LCA Guidelines Equation(2)를 액체 화석연료(슬립 없음,
 * Cfug=0 가이드라인 기본값)에 맞춰 단순화: TtW = (Cf_CO2·GWP_CO2 + Cf_CH4·GWP_CH4 + Cf_N2O·GWP_N2O) / LCV
 */
function computeTtW(f: ImoFuelWtWFactors): number {
  const gPerGFuel = f.cfCo2GPerGFuel * GWP100.CO2 + f.cfCh4GPerGFuel * GWP100.CH4 + f.cfN2oGPerGFuel * GWP100.N2O;
  return gPerGFuel / f.lcvMjPerG;
}

/** Well-to-Wake GHG 원단위(gCO2eq/MJ) = WtT + TtW. 이 값이 선박의 "달성 GFI"다. */
export function computeFuelWtW(fuelType: ImoNzfFuelType): number {
  const f = IMO_FUEL_FACTORS[fuelType];
  return f.wttGCo2eqPerMj + computeTtW(f);
}

/**
 * 연료 소비량(t)으로부터 총 WtW CO2eq 배출량(t)을 계산한다. 다른 모델(예: 접안 중 배출량
 * 추정)이 "달성 GFI"가 아니라 "총 배출량"만 필요할 때 이 함수를 재사용한다.
 */
export function computeCo2eqTon(fuelType: ImoNzfFuelType, fuelConsumptionTon: number): number {
  const f = IMO_FUEL_FACTORS[fuelType];
  const wtwGPerMj = computeFuelWtW(fuelType);
  const energyMj = Math.max(0, fuelConsumptionTon) * 1_000_000 * f.lcvMjPerG; // t → g(×1e6) × MJ/g
  return (wtwGPerMj * energyMj) / 1_000_000; // g → t
}

// GFI 2008 기준선. 연도별 목표 = 기준선 × (1 − 감축율).
const GFI_REFERENCE_G_PER_MJ = 93.3;

// 연도별 Base/Direct Compliance 감축율(%, 2008 기준선 대비). MEPC 83(2025-04) 승인.
const GFI_REDUCTION_PCT: Record<number, { base: number; directCompliance: number }> = {
  2028: { base: 4, directCompliance: 17 },
  2029: { base: 6, directCompliance: 19 },
  2030: { base: 8, directCompliance: 21 },
  2031: { base: 12.4, directCompliance: 25.4 },
  2032: { base: 16.8, directCompliance: 29.8 },
  2033: { base: 21.2, directCompliance: 34.2 },
  2034: { base: 25.6, directCompliance: 38.6 },
  2035: { base: 30, directCompliance: 43 },
};

export interface GfiTargets {
  baseTarget: number; // gCO2eq/MJ — 이 값 초과분부터 Tier 2
  directComplianceTarget: number; // gCO2eq/MJ — 이 값 초과분부터 Tier 1
}

/** 연도별 GFI 목표(gCO2eq/MJ)를 반환한다. 2028~2035 외 연도는 아직 미확정이라 null. */
export function computeGfiTargets(year: number): GfiTargets | null {
  const pct = GFI_REDUCTION_PCT[year];
  if (!pct) return null; // 2036년 이후는 2032년 이전 MEPC가 추가 결정 예정(미확정).
  return {
    baseTarget: GFI_REFERENCE_G_PER_MJ * (1 - pct.base / 100),
    directComplianceTarget: GFI_REFERENCE_G_PER_MJ * (1 - pct.directCompliance / 100),
  };
}

// Remedial Unit 가격 — 2028~2030 이행연도에만 고정. 2031년 이후는 Regulation 36(10)에 따라
// MEPC가 추후 결정(현재 미공표) — 그 기간은 부족톤수까지만 계산하고 금액은 비운다.
const REMEDIAL_UNIT_PRICE_2028_2030 = { tier1UsdPerTon: 100, tier2UsdPerTon: 380 };
const MIN_GT_APPLICABLE = 5000;

export interface ImoNetZeroLevyInput {
  fuelType: ImoNzfFuelType; // LNG는 WtT 계수 미확정으로 미지원
  fuelConsumptionTon: number; // 산정 대상 기간(통상 연간 보고기간)의 총 연료 소비량
  grossTonnage: number; // 적용대상(5,000GT 이상) 판정용
  isForeignGoing?: boolean; // 국제항해 선박 여부(기본 true). 자국 영해 내만 운항하는 내항선은 규정상 적용 제외.
  year: number; // 이행연도
}

export interface ImoNetZeroLevyResult {
  applicable: boolean; // 5,000GT 이상 + 국제항해 + 목표 확정 연도인지
  attainedGfi: number | null; // gCO2eq/MJ — 선박의 달성 GFI(연료 WtW 원단위)
  targets: GfiTargets | null;
  energyMj: number | null; // 연료 소비량 → 에너지 환산(MJ)
  tier1DeficitTon: number | null; // Direct~Base 구간 부족분(tCO2eq)
  tier2DeficitTon: number | null; // Base 초과 부족분(tCO2eq)
  priceKnown: boolean; // Remedial Unit 가격이 확정된 기간(2028~2030)인지
  tier1LevyUsd: number | null;
  tier2LevyUsd: number | null;
  totalLevyUsd: number | null;
  note: string;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function emptyResult(note: string): ImoNetZeroLevyResult {
  return {
    applicable: false,
    attainedGfi: null,
    targets: null,
    energyMj: null,
    tier1DeficitTon: null,
    tier2DeficitTon: null,
    priceKnown: false,
    tier1LevyUsd: null,
    tier2LevyUsd: null,
    totalLevyUsd: null,
    note,
  };
}

/**
 * IMO Net-Zero Framework 탄소부담금을 계산한다.
 * 1) 적용대상(5,000GT 이상 + 국제항해) + 목표 확정 연도(2028~2035)인지 확인.
 * 2) 연료의 WtW GFI(달성치)를 계산해 그 해 Base/Direct Compliance 목표와 비교.
 * 3) 초과분을 Tier1/Tier2 부족톤수로 나누고, 가격이 확정된 기간(2028~2030)만 USD로 환산.
 */
export function computeImoNetZeroLevy(input: ImoNetZeroLevyInput): ImoNetZeroLevyResult {
  if (input.grossTonnage < MIN_GT_APPLICABLE) {
    return emptyResult(`총톤수 ${MIN_GT_APPLICABLE.toLocaleString()}톤 미만은 IMO Net-Zero Framework 적용대상이 아닙니다(국제항해 선박만 해당).`);
  }
  const isForeignGoing = input.isForeignGoing ?? true;
  if (!isForeignGoing) {
    return emptyResult("자국 영해 내에서만 운항하는 내항선(국제항해 아님)은 IMO Net-Zero Framework 적용 제외 대상입니다.");
  }

  const targets = computeGfiTargets(input.year);
  if (!targets) {
    return emptyResult(`${input.year}년 GFI 목표치가 아직 확정되지 않았습니다(2028~2035만 확정, 이후는 2032년 이전 MEPC가 추가 결정 예정).`);
  }

  const attainedGfi = computeFuelWtW(input.fuelType);
  const factors = IMO_FUEL_FACTORS[input.fuelType];
  const energyMj = input.fuelConsumptionTon * 1_000_000 * factors.lcvMjPerG; // t → g(×1e6) × MJ/g

  const tier1Intensity = Math.max(0, Math.min(attainedGfi, targets.baseTarget) - targets.directComplianceTarget);
  const tier2Intensity = Math.max(0, attainedGfi - targets.baseTarget);
  const tier1DeficitTon = (tier1Intensity * energyMj) / 1_000_000; // g → t
  const tier2DeficitTon = (tier2Intensity * energyMj) / 1_000_000;

  const priceKnown = input.year >= 2028 && input.year <= 2030;
  const tier1LevyUsd = priceKnown ? tier1DeficitTon * REMEDIAL_UNIT_PRICE_2028_2030.tier1UsdPerTon : null;
  const tier2LevyUsd = priceKnown ? tier2DeficitTon * REMEDIAL_UNIT_PRICE_2028_2030.tier2UsdPerTon : null;
  const totalLevyUsd = priceKnown && tier1LevyUsd != null && tier2LevyUsd != null ? tier1LevyUsd + tier2LevyUsd : null;

  const complianceText =
    tier2DeficitTon > 0
      ? `Base Target 초과(Tier2 위반) — 부족분 Tier1 ${round(tier1DeficitTon)}t + Tier2 ${round(tier2DeficitTon)}t`
      : tier1DeficitTon > 0
        ? `Direct Compliance Target 미달, Base Target 이내(Tier1만 해당) — 부족분 ${round(tier1DeficitTon)}t`
        : "Direct Compliance Target 이내 — 부족분 없음(Remedial Unit 구매 불필요)";
  const priceText = priceKnown
    ? `부담금 $${round(totalLevyUsd ?? 0).toLocaleString("en-US")}(Tier1 $100/t·Tier2 $380/t, 2028-2030 확정가)`
    : "2031년 이후 Remedial Unit 가격은 MEPC 미확정 — 부족톤수만 계산, 금액 산정 불가";

  return {
    applicable: true,
    attainedGfi: round(attainedGfi, 2),
    targets: { baseTarget: round(targets.baseTarget, 2), directComplianceTarget: round(targets.directComplianceTarget, 2) },
    energyMj: round(energyMj, 1),
    tier1DeficitTon: round(tier1DeficitTon),
    tier2DeficitTon: round(tier2DeficitTon),
    priceKnown,
    tier1LevyUsd: tier1LevyUsd != null ? round(tier1LevyUsd) : null,
    tier2LevyUsd: tier2LevyUsd != null ? round(tier2LevyUsd) : null,
    totalLevyUsd: totalLevyUsd != null ? round(totalLevyUsd) : null,
    note: `달성 GFI ${round(attainedGfi, 1)} vs Base ${round(targets.baseTarget, 1)}/Direct ${round(targets.directComplianceTarget, 1)} gCO2eq/MJ — ${complianceText}. ${priceText}`,
  };
}
