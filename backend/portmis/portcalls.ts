// Port-MIS 응답(PortMisItem)을 화면·DB용 PortCall로 변환한다.
//
// "현재 정박 중"의 정의: 최근 입항(입항 신고)이 최근 출항(출항 신고)보다 뒤에 있으면 아직
// 항내에 있는 배로 본다. 입항만 있고 출항이 없으면 당연히 정박 중, 입항·출항 시각이 같으면
// (당일 입출항) 이미 떠난 것으로 본다.

import type { PortCall } from "../ports/port-types";
import type { PortMisDetail, PortMisItem } from "./types";

function timeOf(v: string | undefined): number {
  return v ? new Date(v).getTime() : NaN;
}

interface Analysis {
  inPort: boolean;
  arrival?: PortMisDetail; // 대표 입항 detail (선석·시각의 출처)
}

function analyze(item: PortMisItem): Analysis {
  const arrivals = item.details.filter((d) => d.etryndNm === "입항" && d.etryptDt);
  const departures = item.details.filter((d) => d.etryndNm === "출항" && d.tkoffDt);

  const lastArrival = arrivals.sort((a, b) => timeOf(b.etryptDt) - timeOf(a.etryptDt))[0];
  const lastDeparture = departures.sort((a, b) => timeOf(b.tkoffDt) - timeOf(a.tkoffDt))[0];

  if (!lastArrival) return { inPort: false };
  const inPort = !lastDeparture || timeOf(lastArrival.etryptDt) > timeOf(lastDeparture.tkoffDt);
  return { inPort, arrival: lastArrival };
}

/** 이 선박이 현재 부산항에 정박(입항 후 미출항) 중인가. */
export function isCurrentlyInPort(item: PortMisItem): boolean {
  return analyze(item).inPort;
}

/** 정박 중인 선박을 PortCall로 변환한다. 대표 detail은 입항 detail(현재 정박 선석·입항시각). */
export function toPortCall(item: PortMisItem): PortCall {
  const { arrival } = analyze(item);
  return {
    callSign: item.clsgn?.trim() || "",
    vesselName: item.vsslNm?.trim() || `(호출부호 ${item.clsgn})`,
    vesselType: item.vsslKndNm,
    nationality: item.vsslNltyNm,
    previousPort: item.prvsDpmprtPrtNm,
    nextPort: item.nxlnptPrtNm,
    event: "입항", // 정박 중 = 입항 상태
    eventTime: arrival?.etryptDt ? new Date(arrival.etryptDt).toISOString() : undefined,
    berthName: arrival?.laidupFcltyNm,
    grossTonnage: arrival?.grtg ? Number(arrival.grtg) : undefined,
  };
}
