// Port-MIS 응답(PortMisItem)을 화면·DB용 PortCall로 변환한다.
//
// "현재 정박 중"의 정의: 최근 입항(입항 신고)이 최근 출항(출항 신고)보다 뒤에 있으면 아직
// 항내에 있는 배로 본다. 입항만 있고 출항이 없으면 당연히 정박 중, 입항·출항 시각이 같으면
// (당일 입출항) 이미 떠난 것으로 본다.

import type { BerthType, PortCall } from "../ports/port-types";
import type { PortMisDetail, PortMisItem } from "./types";

// 시설명으로 접안/묘박을 판정한다. "박지/묘지/정박지"는 닻을 내리는 대기 지점(묘박),
// 그 외(부두·선석·물량장·안벽·호안·조선소·돌핀·터미널 등)는 시설에 붙는 접안이다.
export function classifyBerth(berthName: string | undefined | null): BerthType | undefined {
  if (!berthName) return undefined;
  return /박지|묘지/.test(berthName) ? "묘박" : "접안";
}

function timeOf(v: string | undefined): number {
  return v ? new Date(v).getTime() : NaN;
}

interface Analysis {
  inPort: boolean;
  arrival?: PortMisDetail; // 대표 입항 detail (선석·시각의 출처)
}

function analyze(item: PortMisItem, now: Date = new Date()): Analysis {
  const nowMs = now.getTime();
  const arrivals = item.details.filter((d) => d.etryndNm === "입항" && d.etryptDt && timeOf(d.etryptDt) <= nowMs);
  const departures = item.details.filter((d) => d.etryndNm === "출항" && d.tkoffDt && timeOf(d.tkoffDt) <= nowMs);

  const lastArrival = arrivals.sort((a, b) => timeOf(b.etryptDt) - timeOf(a.etryptDt))[0];
  const lastDeparture = departures.sort((a, b) => timeOf(b.tkoffDt) - timeOf(a.tkoffDt))[0];

  if (!lastArrival) return { inPort: false };
  const inPort = !lastDeparture || timeOf(lastArrival.etryptDt) > timeOf(lastDeparture.tkoffDt);
  return { inPort, arrival: lastArrival };
}

/** 이 선박이 현재 부산항에 정박(입항 후 미출항) 중인가. */
export function isCurrentlyInPort(item: PortMisItem, now: Date = new Date()): boolean {
  return analyze(item, now).inPort;
}

// 하루 단위로 여러 번 조회하면 같은 선박이 여러 item으로 흩어져 온다(입항일 item, 출항일 item
// 등). (호출부호|선박명)으로 묶어 detail을 모두 합쳐야, 입항·출항 전체를 보고 정박 여부를
// 정확히 판정할 수 있다.
export function mergeByVessel(items: PortMisItem[]): PortMisItem[] {
  const map = new Map<string, PortMisItem>();
  for (const it of items) {
    const key = `${it.clsgn}|${it.vsslNm}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...it, details: [...it.details] });
    } else {
      cur.details.push(...it.details);
      cur.prvsDpmprtPrtNm ??= it.prvsDpmprtPrtNm;
      cur.nxlnptPrtNm ??= it.nxlnptPrtNm;
      cur.vsslKndNm ??= it.vsslKndNm;
      cur.vsslNltyNm ??= it.vsslNltyNm;
    }
  }
  return [...map.values()];
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
    berthType: classifyBerth(arrival?.laidupFcltyNm),
    grossTonnage: arrival?.grtg ? Number(arrival.grtg) : undefined,
  };
}
