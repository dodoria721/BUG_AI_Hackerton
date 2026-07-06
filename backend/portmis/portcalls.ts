// Port-MIS 응답(PortMisItem)을 화면·DB용 PortCall로 변환한다.
//
// "현재 정박 중"의 정의: 최근 입항(입항 신고)이 최근 출항(출항 신고)보다 뒤에 있으면 아직
// 항내에 있는 배로 본다. 입항만 있고 출항이 없으면 당연히 정박 중, 입항·출항 시각이 같으면
// (당일 입출항) 이미 떠난 것으로 본다.

import type { BerthType, PortCall, PortConfig } from "../ports/port-types";
import { resolveBerthArea } from "./berth-areas";
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

export interface BerthActivity {
  arrivals: number;
  departures: number;
}

// 최근 windowHours 시간 내 입·출항 신고를 부두(berthArea)별로 센다. port_calls 스냅샷은
// "현재 정박 중" 선박만 담아 출항 건이 아예 빠지므로, 입·출항 건수는 이 집계로만 얻는다.
// items는 mergeByVessel을 거친 것이어야 한다 — 하루 단위 조회로 같은 신고가 입항일 item과
// 출항일 item에 중복 유입되므로, 선박 안에서 (이벤트|시각)으로 dedup한 뒤 센다.
// 부두 미매칭 신고는 '' 키에 담는다(호출부에서 기본 지역으로 배정).
export function countRecentActivity(
  items: PortMisItem[],
  config: PortConfig,
  now: Date = new Date(),
  windowHours = 24
): Map<string, BerthActivity> {
  const nowMs = now.getTime();
  const fromMs = nowMs - windowHours * 60 * 60 * 1000;
  const acc = new Map<string, BerthActivity>();

  for (const item of items) {
    const seen = new Set<string>();
    for (const d of item.details) {
      const isArrival = d.etryndNm === "입항";
      const isDeparture = d.etryndNm === "출항";
      const t = isArrival ? d.etryptDt : isDeparture ? d.tkoffDt : undefined;
      if (!t) continue;
      const ms = timeOf(t);
      if (!Number.isFinite(ms) || ms < fromMs || ms > nowMs) continue;
      const dedupKey = `${d.etryndNm}|${t}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const areaId = resolveBerthArea(d.laidupFcltyNm, config)?.id ?? "";
      const a = acc.get(areaId) ?? { arrivals: 0, departures: 0 };
      if (isArrival) a.arrivals++;
      else a.departures++;
      acc.set(areaId, a);
    }
  }
  return acc;
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
