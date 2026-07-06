// 해수부 연안AIS 통계(WFS) → 혼잡도 곡선. fetch(mof-ais-stats) + 정규화(computeAisStatsCongestion)를
// 묶어, /api/congestion 이 Port-MIS 다음 폴백으로 쓸 수 있게 CongestionForecast | null 을 준다.
//
// 이 통계는 연 단위(offeryear) 과거 집계라 "오늘 실시간"이 아니다. 그래서 조회 날짜를 고른다:
//   1) MOF_AIS_STATS_DATE(YYYYMMDD) 환경변수가 있으면 그 날짜
//   2) 없으면 최근 몇 개 연도의 "오늘과 같은 월/일"을 순서대로 시도(가장 최근 가용 연도 채택)
// 데이터가 있는(관측 시간대가 하나라도 있는) 첫 날짜를 쓰고, 전부 없으면 null(호출부에서 AIS 폴백).

import type { BoundingBox } from "./busan-filter";
import type { CongestionForecast } from "../ports/port-types";
import { computeAisStatsCongestion } from "../prediction/congestion";
import { BUSAN_PORT } from "../ports/seed-port";
import { fetchBusanShipStats, type HourlyShipCount } from "./mof-ais-stats";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 후보 날짜 목록(YYYYMMDD). 환경변수 우선, 없으면 최근 N개 연도의 같은 월/일.
function candidateDates(now: Date, years = 3): string[] {
  const env = process.env.MOF_AIS_STATS_DATE?.trim();
  if (env && /^\d{8}$/.test(env)) return [env];
  const mmdd = `${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const list: string[] = [];
  for (let i = 1; i <= years; i++) list.push(`${now.getFullYear() - i}${mmdd}`);
  return list;
}

/**
 * 부산 bbox의 시간대별 AIS 척수(원본)를 가져온다. 관측 시간대가 하나라도 있는 첫 후보 날짜를
 * 채택하고, 데이터가 없거나 미설정이면 null. 결합 혼잡도(현재=AIS)에서 원본이 필요해 분리했다.
 */
export async function fetchBusanHourlyStats(
  now: Date = new Date(),
  boundingBox?: BoundingBox
): Promise<{ date: string; hourly: HourlyShipCount[] } | null> {
  if (!process.env.MOF_AIS_API_KEY || !process.env.MOF_AIS_DOMAIN) return null;

  for (const date of candidateDates(now)) {
    try {
      const stats = await fetchBusanShipStats(date, boundingBox ? { boundingBox } : undefined);
      if (stats.hourly.some((h) => h.present)) return { date, hourly: stats.hourly };
    } catch (err) {
      console.error(`[ais-stats-congestion] ${date} 조회 실패:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/** 해수부 연안AIS 통계 단독 기반 혼잡도(폴백용). 데이터가 없거나 오류면 null. */
export async function fetchAisStatsCongestion(now: Date = new Date()): Promise<CongestionForecast | null> {
  const raw = await fetchBusanHourlyStats(now);
  return raw ? computeAisStatsCongestion(raw.hourly, BUSAN_PORT, now) : null;
}
