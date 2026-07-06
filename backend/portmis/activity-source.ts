// port_call_activity 테이블 읽기/쓰기 — 최근 24시간 부두별 입·출항 신고 집계 스냅샷.
// run-enrich.ts가 매 실행 시 교체하고, 지역별 혼잡도(regional-congestion)가 읽는다.
// port_calls는 "현재 정박 중" 선박 스냅샷이라 출항한 배가 아예 담기지 않으므로
// (event도 전부 "입항"), 입·출항 건수는 이 테이블에서만 얻을 수 있다.

import { getSupabase } from "../db/supabase";
import type { BerthActivity } from "./portcalls";

// 집계 창(시간). countRecentActivity 호출과 UI 표기가 이 값을 공유한다.
export const ACTIVITY_WINDOW_HOURS = 24;

interface ActivityRow {
  berth_area_id: string; // seed-port berthAreas.id ('' = 부두 미매칭)
  arrivals: number;
  departures: number;
  window_hours: number;
}

export interface PortCallActivity {
  byBerthArea: Map<string, BerthActivity>;
  windowHours: number;
}

/** 부두별 입·출항 집계를 스냅샷으로 저장한다(전체 교체). */
export async function savePortCallActivity(
  activity: Map<string, BerthActivity>,
  windowHours: number = ACTIVITY_WINDOW_HOURS
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Supabase 미설정" };

  const rows: ActivityRow[] = [...activity.entries()].map(([berthAreaId, a]) => ({
    berth_area_id: berthAreaId,
    arrivals: a.arrivals,
    departures: a.departures,
    window_hours: windowHours,
  }));

  const { error: delErr } = await db.from("port_call_activity").delete().not("berth_area_id", "is", null);
  if (delErr) return { ok: false, error: delErr.message };

  if (rows.length === 0) return { ok: true }; // 창 내 신고가 없으면 빈 스냅샷
  const { error: insErr } = await db.from("port_call_activity").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

/** 저장된 부두별 입·출항 집계를 반환한다. DB 미설정/오류/빈 테이블이면 빈 Map. */
export async function fetchPortCallActivity(): Promise<PortCallActivity> {
  const empty: PortCallActivity = { byBerthArea: new Map(), windowHours: ACTIVITY_WINDOW_HOURS };
  const db = getSupabase();
  if (!db) return empty;

  const { data, error } = await db.from("port_call_activity").select("*");
  if (error) {
    console.error("[activity-source] 조회 실패:", error.message);
    return empty;
  }

  const rows = (data as ActivityRow[] | null) ?? [];
  const byBerthArea = new Map<string, BerthActivity>();
  for (const r of rows) {
    byBerthArea.set(r.berth_area_id, { arrivals: r.arrivals, departures: r.departures });
  }
  return { byBerthArea, windowHours: rows[0]?.window_hours ?? ACTIVITY_WINDOW_HOURS };
}
