// 현재 혼잡도 곡선을 결정하는 소스 선택 로직 — /api/congestion 과 /api/advisor 가 공유한다.
// 혼잡도는 실시간 선박 위치가 아니라 통계 기반으로만 계산한다:
//   - 현재 혼잡도 = 해수부 연안AIS 통계(해역 시간대별 척수 밀도)
//   - 미래 예측   = Port-MIS 입항 신고(미래 입항 예정)

import { fetchBusanHourlyStats } from "../ais/ais-stats-congestion-source";
import type { CongestionForecast } from "../ports/port-types";
import { BUSAN_PORT } from "../ports/seed-port";
import { fetchPortCongestion } from "../portmis/congestion-source";
import { combineAisAndPortMisCongestion, computeAisStatsCongestion } from "../prediction/congestion";

export async function resolveCongestion(now: Date = new Date()): Promise<CongestionForecast> {
  const [mis, ais] = await Promise.all([fetchPortCongestion(), fetchBusanHourlyStats(now)]);

  // 둘 다 있으면 결합: 현재·과거는 AIS 밀도, 미래는 Port-MIS 예측.
  if (mis && ais) return combineAisAndPortMisCongestion(mis, ais.hourly, BUSAN_PORT, now);

  // AIS 통계 단독(현재 혼잡도 곡선) — 현재 혼잡도의 주 소스.
  if (ais) return computeAisStatsCongestion(ais.hourly, BUSAN_PORT, now);

  // AIS 통계가 없을 때만 Port-MIS 단독으로.
  if (mis) return mis;

  // 통계 소스가 전부 없으면 빈 곡선(선박 위치 기반 폴백은 두지 않는다).
  return {
    port: BUSAN_PORT.name,
    currentLevel: 0,
    forecast: [],
    source: "none",
    basis: "no-congestion-source-available",
    lastUpdated: now.toISOString(),
  };
}
