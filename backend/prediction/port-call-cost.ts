// 입항 1건의 비용(운영자 관점) — ML 없이 결정론적. 실제 출처를 밝힐 수 있는 항목만 다룬다.
//
// 구성 항목과 근거:
//   1) 항해 연료비 — fuel.ts voyageFuelTon() × 연료단가. 항해 구간(distanceNm)이 있을 때만.
//   2) 정박 연료비 — fuel.ts hotelingFuelRate() × 정박시간 × 연료단가.
//   3) 정박료(mooringFee) — carbon-port-due.ts computeCarbonPortDue() 재사용.
//      해양수산부 고시 실제 요율(신뢰도 높음).
//   4) 탄소 그림자가격(carbonShadowCost) — 같은 computeCarbonPortDue()가 함께 계산한다.
//      부산항이 실제로 부과하는 금액이 아니므로 totalUsd에는 넣지 않고
//      totalWithCarbonShadowUsd(참고 시나리오)에만 별도로 더한다.
//
// ⚠️ 애초 검토했던 예선료·선원 인건비·대기(체선)비용·냉동컨테이너 전력비는 신뢰할 만한
//    공개 요율 자료(부산항 예선료 절대 요율표, 선원 임금 통계, GT→냉동TEU 환산 등)를
//    찾지 못해 이 모델에서 제외했다. 확인 안 된 추정치를 비용 항목으로 내놓지 않기 위함이다.

import type { PortConfig } from "../ports/port-types";
import { FUEL_PRICE_USD_PER_TON, hotelingFuelRate, voyageFuelTon, type FuelType } from "./fuel";
import { computeCarbonPortDue, type CarbonPortDue } from "./carbon-port-due";

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface FuelCostLeg {
  tonnage: number;
  fuelType: FuelType;
  costUsd: number;
}

export interface PortCallCostInput {
  vesselType?: string; // 선종명(Port-MIS vsslKndNm)
  grossTonnage: number; // 총톤수
  distanceNm?: number; // 항해 구간 거리(해리). 없으면 항해 연료비는 생략(정박 중심 계산).
  speedKn?: number; // 항해 선속. distanceNm이 있을 때만 사용(기본 12kn).
  berthHours?: number; // 정박 총 시간. 기본은 항만 평균 재항시간(dwellMedianHours).
  isForeignGoing?: boolean; // 외항선 여부(기본 true) — 정박료 요율 구분에 사용.
  year?: number; // CII 등급 산정 연도(carbon-port-due.ts로 위임, 정보 표시용)
}

export interface PortCallCostBreakdown {
  grossTonnage: number;
  berthHours: number;
  voyageFuel: FuelCostLeg | null; // distanceNm 없으면 null
  hotelingFuel: FuelCostLeg;
  portDue: CarbonPortDue; // 정박료(실제) + 탄소 그림자가격(참고) 상세 내역
  totalUsd: number; // 연료비 + 정박료(실제 요율 기준) — 실비용에 가까운 합계
  totalWithCarbonShadowUsd: number; // totalUsd + 탄소 그림자가격(참고 시나리오, 실제 청구 아님)
  note: string;
}

/** 입항 1건의 연료비·정박료를 계산해 합산한다. 탄소 그림자가격은 별도 필드로만 더한다. */
export function computePortCallCost(input: PortCallCostInput, config: PortConfig): PortCallCostBreakdown {
  const grossTonnage = Math.max(0, input.grossTonnage);
  const berthHours = input.berthHours ?? config.portCallCapacity.dwellMedianHours;

  const voyageFuel: FuelCostLeg | null =
    input.distanceNm != null && input.distanceNm > 0
      ? (() => {
          const speedKn = input.speedKn ?? 12;
          const tonnage = voyageFuelTon(input.vesselType, grossTonnage, input.distanceNm!, speedKn);
          const fuelType = hotelingFuelRate(input.vesselType, grossTonnage).fuelType === "LNG" ? "LNG" : "VLSFO"; // 항해 중 연료종류
          return { tonnage: round(tonnage, 2), fuelType, costUsd: round(tonnage * FUEL_PRICE_USD_PER_TON[fuelType]) };
        })()
      : null;

  const hotel = hotelingFuelRate(input.vesselType, grossTonnage);
  const hotelTonnage = hotel.ratePerHourTon * berthHours;
  const hotelingFuel: FuelCostLeg = {
    tonnage: round(hotelTonnage, 2),
    fuelType: hotel.fuelType,
    costUsd: round(hotelTonnage * FUEL_PRICE_USD_PER_TON[hotel.fuelType]),
  };

  const portDue = computeCarbonPortDue(
    { vesselType: input.vesselType, grossTonnage, berthHours, isForeignGoing: input.isForeignGoing, year: input.year },
    config
  );

  const totalUsd = round((voyageFuel?.costUsd ?? 0) + hotelingFuel.costUsd + portDue.mooringFeeUsdApprox);
  const totalWithCarbonShadowUsd = round(totalUsd + portDue.carbonShadowCostUsd);

  const note = `정박료 ${portDue.mooringFeeKrw.toLocaleString("ko-KR")}원(≈$${portDue.mooringFeeUsdApprox.toLocaleString(
    "en-US"
  )}) · 정박연료 $${hotelingFuel.costUsd.toLocaleString("en-US")}${
    voyageFuel ? ` · 항해연료 $${voyageFuel.costUsd.toLocaleString("en-US")}` : ""
  } · 탄소 그림자가격 $${portDue.carbonShadowCostUsd.toLocaleString("en-US")}(참고, totalUsd에 미포함)`;

  return {
    grossTonnage,
    berthHours: round(berthHours, 1),
    voyageFuel,
    hotelingFuel,
    portDue,
    totalUsd,
    totalWithCarbonShadowUsd,
    note,
  };
}
