// 지역별(부산 북항/감천/신항) 시간대별 혼잡도 + 입출항 요약.
//  - 시간대별 곡선: 해수부 연안AIS 통계를 지역 bbox(center±radiusKm)로 조회해 계산(현재 혼잡도 기준).
//  - 입항/출항 수치: run-enrich가 저장한 최근 24시간 부두별 입·출항 집계(port_call_activity)를
//    berthAreaId → region 으로 매핑해 합산. port_calls 스냅샷은 "현재 정박 중" 선박만 담아
//    출항 건이 아예 없으므로(전부 event="입항") 여기서 쓰면 안 된다.
//  - 미래 예측: Port-MIS 미래 입출항 신고(현재 스냅샷엔 없음)가 채워지면 곡선 미래 구간에 반영.
// ⚠️ AIS 격자는 북항·감천을 한 셀로 묶어 분리 못 하므로(aisSeparable=false), 두 지역 곡선은 유사할 수 있다.

import { fetchBusanHourlyStats } from "../ais/ais-stats-congestion-source";
import { boundingBoxAroundPoint } from "../ais/busan-filter";
import type { CongestionRegion, PortConfig, RegionCongestionSeries } from "../ports/port-types";
import { BUSAN_PORT } from "../ports/seed-port";
import { fetchPortCallActivity } from "../portmis/activity-source";
import type { BerthActivity } from "../portmis/portcalls";
import { computeAisStatsCongestion } from "../prediction/congestion";

// 부두별 입·출항 집계를 지역별로 합산한다: berthAreaId → region.id ('' 등 미매칭은 기본 지역).
function aggregateActivity(config: PortConfig, byBerthArea: Map<string, BerthActivity>) {
  const regions = config.congestionRegions;
  const defaultRegion = regions.find((r) => r.isDefault) ?? regions[0];
  const berthToRegion = new Map<string, string>();
  for (const r of regions) for (const b of r.berthAreaIds) berthToRegion.set(b, r.id);

  const acc = new Map<string, BerthActivity>();
  for (const r of regions) acc.set(r.id, { arrivals: 0, departures: 0 });

  for (const [berthAreaId, a] of byBerthArea) {
    const regionId = berthToRegion.get(berthAreaId) ?? defaultRegion?.id;
    if (!regionId) continue;
    const t = acc.get(regionId);
    if (!t) continue;
    t.arrivals += a.arrivals;
    t.departures += a.departures;
  }
  return acc;
}

async function buildRegionSeries(
  region: CongestionRegion,
  config: PortConfig,
  now: Date,
  mis: BerthActivity,
  activityWindowHours: number
): Promise<RegionCongestionSeries> {
  const box = boundingBoxAroundPoint(region.center, region.radiusKm);
  const ais = await fetchBusanHourlyStats(now, box);
  const curve = ais ? computeAisStatsCongestion(ais.hourly, config, now, region.aisHourlyCapacity) : null;

  // 현재 재항 척수 = AIS 통계의 현재 시각(KST) 해역 척수.
  const kstHour = (now.getUTCHours() + 9) % 24;
  const currentVessels = ais?.hourly.find((h) => h.hour === kstHour && h.present)?.count ?? 0;

  return {
    id: region.id,
    name: region.name,
    currentLevel: curve?.currentLevel ?? 0,
    forecast: curve?.forecast ?? [],
    arrivals: mis.arrivals,
    departures: mis.departures,
    activityWindowHours,
    currentVessels,
    aisSeparable: region.aisSeparable,
    source: curve ? "mof-ais-stats" : "none",
  };
}

export async function resolveRegionalCongestion(
  config: PortConfig = BUSAN_PORT,
  now: Date = new Date()
): Promise<RegionCongestionSeries[]> {
  const activity = await fetchPortCallActivity();
  const mis = aggregateActivity(config, activity.byBerthArea);

  // 지역별 AIS 조회를 병렬로.
  return Promise.all(
    config.congestionRegions.map((r) =>
      buildRegionSeries(r, config, now, mis.get(r.id) ?? { arrivals: 0, departures: 0 }, activity.windowHours)
    )
  );
}
