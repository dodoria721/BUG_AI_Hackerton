// 부산항 정박료(실제 고시 요율) + 참고용 탄소 그림자가격 — ML 없이 결정론적.
//
// ⚠️ 두 수치의 성격이 다르다. 섞어서 "부산항이 부과하는 탄소세"처럼 말하면 안 된다.
//   1) mooringFee : 해양수산부 고시 제2018-174호 [별표1]("무역항의 항만시설 사용 및
//      사용료에 관한 규정", 항만법 시행령 제46조 제2항)의 실제 정박료다. 총톤수 150톤 이상
//      선박에 "10톤당·12시간당" 기본료 + 12시간 초과분에 대한 초과사용료로 부과된다.
//      외항선/내항선 요율이 다르다. → 공식 요율(신뢰도 높음).
//   2) carbonShadowCost : 부산항이 실제로 걷는 요금이 아니다. "이번 입항(정박)에서 배출한
//      CO2에 국제 탄소시장(EU ETS) 가격을 매기면 얼마인가"를 보여주는 참고 지표(shadow
//      price)다. ESG/의사결정 참고용이며 실제로 청구되지 않는다.
//
//   참고: 부산항만공사(BPA)는 2026-01-01부터 실제 "친환경선박(ESI) 인센티브" 제도를 시행
//   중이다(ESI 35.0~49.9점 5%, 50.0점 이상 10% 항만시설사용료 감면, 컨테이너 외항선 대상).
//   이 모델의 CII 등급(IMO 표준식)과는 다른 지표(ESI: NOx·SOx·CO2·육상전원공급 종합점수)라
//   ESI 산출에 필요한 데이터를 이 플랫폼이 보유하지 않는다 — 그래서 CII 등급은 정보로만
//   표시하고, 임의로 지어낸 할인·할증 금액은 계산하지 않는다.
//
// 배출량은 fuel.ts(정박 연료→CO2), 등급은 cii.ts(A~E, IMO 표준식)를 재사용한다.
// 요율·환율·탄소 시장가는 seed-port.ts(portDue)에서 온다(데이터/코드 분리).

import type { PortConfig } from "../ports/port-types";
import { CO2_FACTOR_TON, hotelingFuelRate } from "./fuel";
import { computeCiiStatus, type CiiGrade } from "./cii";

export interface CarbonPortDueInput {
  vesselType?: string; // 선종명(Port-MIS vsslKndNm) — 연료·CII 분류에 사용
  grossTonnage: number; // 총톤수
  berthHours?: number; // 정박 시간. 기본은 항만 평균 재항시간(dwellMedianHours)
  isForeignGoing?: boolean; // 외항선 여부(기본 true). 내항선은 정박료 요율이 다르다.
  year?: number; // CII 등급 산정 연도(기본 현재 연도)
}

export interface CarbonPortDue {
  grossTonnage: number;
  berthHours: number;
  isForeignGoing: boolean;
  mooringFeeKrw: number; // 정박료(해수부 고시 실제 요율, KRW)
  mooringFeeUsdApprox: number; // 참고 환산(USD) — 고정 환율 스냅샷 기준, 안내용
  portCallCo2Ton: number; // 이번 입항(정박)에서 배출하는 CO2
  carbonShadowPriceUsdPerTon: number;
  carbonShadowCostUsd: number; // 참고용 그림자가격 — 실제 청구 금액이 아님
  ciiGrade: CiiGrade | null; // IMO 표준식(cii.ts) 등급. 정보 표시용, 금액에 반영하지 않음
  note: string;
  disclaimer: string;
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** GT/10 × (기본 12시간 단위 요율 + 초과시간 요율)로 정박료를 계산한다. GT 미달이면 면제. */
function computeMooringFeeKrw(grossTonnage: number, berthHours: number, isForeignGoing: boolean, config: PortConfig): number {
  const policy = config.portDue;
  if (grossTonnage < policy.minGrossTonnageForFee) return 0;
  const rate = isForeignGoing ? policy.foreignGoing : policy.coastal;
  const units10Ton = grossTonnage / 10;
  const baseFee = units10Ton * rate.base10TonPer12hKrw;
  const excessHours = Math.max(0, berthHours - 12);
  const excessFee = units10Ton * excessHours * rate.excess10TonPer1hKrw;
  return baseFee + excessFee;
}

/**
 * 선박(선종·총톤수·정박시간)에 대해 실제 정박료와 참고용 탄소 그림자가격을 계산한다.
 * 두 값은 성격이 달라 합산해 하나의 "청구액"처럼 반환하지 않는다(호출부에서 필요시 분리 표시).
 */
export function computeCarbonPortDue(input: CarbonPortDueInput, config: PortConfig): CarbonPortDue {
  const policy = config.portDue;
  const gt = Math.max(0, input.grossTonnage);
  const berthHours = Math.max(0, input.berthHours ?? config.portCallCapacity.dwellMedianHours);
  const isForeignGoing = input.isForeignGoing ?? true;
  const year = input.year ?? new Date().getFullYear();

  const mooringFeeKrw = computeMooringFeeKrw(gt, berthHours, isForeignGoing, config);
  const mooringFeeUsdApprox = mooringFeeKrw / policy.fxKrwPerUsd;

  const hotel = hotelingFuelRate(input.vesselType, gt);
  const fuelTon = hotel.ratePerHourTon * berthHours;
  const portCallCo2Ton = fuelTon * CO2_FACTOR_TON[hotel.fuelType];
  const carbonShadowCostUsd = portCallCo2Ton * policy.carbonShadowPriceUsdPerTon;

  const cii = computeCiiStatus(input.vesselType, gt, year);
  const ciiGrade = cii?.grade ?? null;

  const feeNote =
    gt < policy.minGrossTonnageForFee
      ? `총톤수 ${policy.minGrossTonnageForFee}톤 미만은 정박료 부과 대상 아님(해수부 고시 기준)`
      : `정박료 ${round(mooringFeeKrw).toLocaleString("ko-KR")}원(${isForeignGoing ? "외항선" : "내항선"} 요율, 해수부 고시 제2018-174호)`;
  const note = `${feeNote} · CO₂ ${round(portCallCo2Ton, 1)}t → 탄소 그림자가격 $${round(carbonShadowCostUsd).toLocaleString(
    "en-US"
  )}(참고용, 실제 부과 아님)${ciiGrade ? ` · CII ${ciiGrade}등급(정보용, 금액 미반영)` : ""}`;

  return {
    grossTonnage: gt,
    berthHours: round(berthHours, 1),
    isForeignGoing,
    mooringFeeKrw: round(mooringFeeKrw),
    mooringFeeUsdApprox: round(mooringFeeUsdApprox),
    portCallCo2Ton: round(portCallCo2Ton, 2),
    carbonShadowPriceUsdPerTon: policy.carbonShadowPriceUsdPerTon,
    carbonShadowCostUsd: round(carbonShadowCostUsd),
    ciiGrade,
    note,
    disclaimer:
      "정박료는 해양수산부 고시 실제 요율(참고 환산 USD는 고정 환율 스냅샷 기준 안내용)이며, 탄소 그림자가격은 부산항이 실제로 부과하는 금액이 아닌 국제 탄소시장(EU ETS) 참고 지표입니다.",
  };
}
