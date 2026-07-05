// 감속(JIT 정시도착) 속도 권고 + 연료·CO2·비용 절감 계산 — ML 없이 결정론적.
//
// 아이디어: 항이 혼잡하면 전속으로 달려가 항 밖에서 묘박 대기하는 것보다,
//   "선석이 빌 시각에 맞춰" 감속해 도착하는 편이 낫다(Just-In-Time arrival).
//   항해연료는 선속의 제곱에 비례(∝v²·거리)하므로 감속하면 크게 줄고, 묘박 대기 중
//   태우던 보조기관 연료도 없앤다. 접안까지 총 소요시간은 두 경우가 같다.
//
//   전속안 : 항해(D/v0) + 묘박대기(waitH)   … 항해연료(v0) + hoteling연료(waitH)
//   JIT안  : 항해(D/vJit)                    … 항해연료(vJit),  vJit = D / (D/v0 + waitH)
//
// 순수 함수. 항만 실측(대기시간)은 waiting.ts, 연료/배출/가격 상수는 fuel.ts 에서 가져온다.

import type { PortConfig } from "../ports/port-types";
import {
  CO2_FACTOR_TON,
  EU_ETS,
  FUEL_PRICE_USD_PER_TON,
  hotelingFuelRate,
  seaFuelRate,
  voyageFuelTon,
} from "./fuel";
import { estimateWaitingHours, type CapacityScope, congestionLevel } from "./waiting";

export interface SpeedAdvisoryInput {
  vesselType?: string; // 선종명(Port-MIS vsslKndNm)
  grossTonnage?: number; // 총톤수
  distanceNm: number; // 현재 위치→부산항 거리(해리). eta.ts haversine ÷ 1.852 로 환산.
  currentSpeedKn: number; // 현재 계획 선속(SOG)
  currentInPort: number; // 실시간 동시 재항 척수(AIS/MIS)
  scope?: CapacityScope; // 혼잡도 스코프(기본 portWide)
  minSpeedKn?: number; // 감속 하한(조타·일정 고려, 기본 8kn)
  euVoyageShare?: number; // EU ETS 과금 대상 비중(0~1). 부산 도착은 기본 0(비EU).
  etsYear?: number; // EU ETS 적용 연도(기본 2026)
}

export interface FuelBreakdown {
  voyageTon: number; // 항해 주기관 연료(t)
  hotelingTon: number; // 묘박/접안 대기 보조기관 연료(t)
  totalTon: number;
}

export interface SpeedAdvisory {
  congestionLevel: number; // 0~1(초과 가능)
  waitHoursIfFullSpeed: number; // 전속 도착 시 예상 묘박 대기(h)
  recommendedSpeedKn: number; // 권고 감속 선속(JIT)
  etaDelayHours: number; // 도착이 늦춰지는 시간(= 대기시간을 항해로 흡수)
  baseline: FuelBreakdown; // 전속+대기
  jit: FuelBreakdown; // 감속
  savings: {
    fuelTon: number;
    co2Ton: number;
    fuelCostUsd: number;
    euEtsUsd: number; // EU 항해분에 한해(euVoyageShare>0일 때)
    totalCostUsd: number; // 연료비 + EU ETS
  };
  note: string;
}

function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function recommendSpeed(input: SpeedAdvisoryInput, config: PortConfig): SpeedAdvisory {
  const {
    vesselType,
    grossTonnage,
    distanceNm,
    currentSpeedKn,
    currentInPort,
    scope = "portWide",
    minSpeedKn = 8,
    euVoyageShare = 0,
    etsYear = 2026,
  } = input;

  const v0 = Math.max(0.1, currentSpeedKn);
  const level = congestionLevel(currentInPort, config, scope);
  const waitH = estimateWaitingHours(level, vesselType, config);

  // JIT 목표: 접안까지 총 시간(항해 + 대기)을 유지하되 전부 항해로 흡수.
  const totalHoursToBerth = distanceNm / v0 + waitH;
  let vJit = distanceNm / totalHoursToBerth;
  let clamped = false;
  if (vJit < minSpeedKn) {
    vJit = minSpeedKn; // 하한 미만이면 하한까지만 감속(대기 일부 잔존)
    clamped = true;
  }
  vJit = Math.min(vJit, v0); // 혼잡이 없으면 감속 없음

  // 시나리오별 연료
  const hotel = hotelingFuelRate(vesselType, grossTonnage); // t/h
  const seaFuel = seaFuelRate(vesselType, grossTonnage, v0); // 항해 연료종류 참조용

  const baseVoyage = voyageFuelTon(vesselType, grossTonnage, distanceNm, v0);
  const baseHotel = hotel.ratePerHourTon * waitH;

  const jitVoyage = voyageFuelTon(vesselType, grossTonnage, distanceNm, vJit);
  // 하한 클램프 시 남는 대기(항해로 다 못 흡수한 분)
  const residualWaitH = clamped ? Math.max(0, totalHoursToBerth - distanceNm / vJit) : 0;
  const jitHotel = hotel.ratePerHourTon * residualWaitH;

  const baseline: FuelBreakdown = {
    voyageTon: round(baseVoyage, 2),
    hotelingTon: round(baseHotel, 2),
    totalTon: round(baseVoyage + baseHotel, 2),
  };
  const jit: FuelBreakdown = {
    voyageTon: round(jitVoyage, 2),
    hotelingTon: round(jitHotel, 2),
    totalTon: round(jitVoyage + jitHotel, 2),
  };

  const fuelTon = Math.max(0, baseline.totalTon - jit.totalTon);
  // 절감 연료는 대부분 항해 연료(VLSFO) + 대기 연료(MGO) 혼합. 보수적으로 항해연료 계수 사용.
  const co2Ton = fuelTon * CO2_FACTOR_TON[seaFuel.fuelType];
  const fuelCostUsd = fuelTon * FUEL_PRICE_USD_PER_TON[seaFuel.fuelType];
  const eua = EU_ETS.euaPriceUsdPerTonCo2[etsYear] ?? 90;
  const phaseIn = EU_ETS.phaseInRate[etsYear] ?? 1;
  const euEtsUsd = co2Ton * phaseIn * Math.max(0, Math.min(1, euVoyageShare)) * eua;

  return {
    congestionLevel: round(level, 3),
    waitHoursIfFullSpeed: round(waitH, 1),
    recommendedSpeedKn: round(vJit, 1),
    etaDelayHours: round(distanceNm / vJit - distanceNm / v0, 1),
    baseline,
    jit,
    savings: {
      fuelTon: round(fuelTon, 2),
      co2Ton: round(co2Ton, 2),
      fuelCostUsd: Math.round(fuelCostUsd),
      euEtsUsd: Math.round(euEtsUsd),
      totalCostUsd: Math.round(fuelCostUsd + euEtsUsd),
    },
    note: clamped
      ? `혼잡도 ${round(level, 2)} — 감속 하한(${minSpeedKn}kn) 도달, 대기 ${round(residualWaitH, 1)}h 잔존`
      : waitH === 0
        ? "혼잡 낮음 — 감속 불필요(현 속력 유지)"
        : `혼잡도 ${round(level, 2)} — ${round(vJit, 1)}kn로 감속해 묘박 대기 회피 권고`,
  };
}
