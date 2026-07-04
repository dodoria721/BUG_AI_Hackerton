// port_congestion 테이블 읽기/쓰기. Port-MIS 기반 시간대별 혼잡도 스냅샷을 저장하고,
// /api/congestion이 이걸 읽어 대시보드에 낸다.

import type { CongestionForecast } from "../ports/port-types";
import { BUSAN_PORT } from "../ports/seed-port";
import { getSupabase } from "../db/supabase";
import { computePortCongestionBreakdown } from "../prediction/congestion";

interface CongestionRow {
  bucket_time: string;
  arrivals: number;
  level: number;
  updated_at?: string;
}

/** 계산된 혼잡도 곡선을 스냅샷으로 저장한다(전체 교체). */
export async function savePortCongestion(forecast: CongestionForecast): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Supabase 미설정" };

  const rows: CongestionRow[] = forecast.forecast.map((p) => ({
    bucket_time: p.time,
    arrivals: p.arrivals ?? 0,
    level: p.level,
  }));

  const { error: delErr } = await db.from("port_congestion").delete().not("bucket_time", "is", null);
  if (delErr) return { ok: false, error: delErr.message };

  const { error: insErr } = await db.from("port_congestion").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

async function fetchCurrentInPortCount(db: NonNullable<ReturnType<typeof getSupabase>>): Promise<number> {
  const { count, error } = await db
    .from("port_calls")
    .select("vessel_name", { count: "exact", head: true })
    .lte("event_time", new Date().toISOString());
  if (error) {
    console.error("[congestion-source] 현재 정박 선박 수 조회 실패:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * 저장된 Port-MIS 혼잡도 곡선을 반환한다. 데이터가 없으면 null(호출부에서 AIS로 폴백).
 * currentLevel은 저장 시점이 아니라 "지금 시각이 속한 버킷" 기준으로 다시 계산한다 —
 * enrich 실행 후 시간이 흘러도 현재 혼잡도가 맞게 유지되도록.
 */
export async function fetchPortCongestion(): Promise<CongestionForecast | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from("port_congestion")
    .select("*")
    .order("bucket_time", { ascending: true });
  if (error) {
    console.error("[congestion-source] 조회 실패:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const rows = data as CongestionRow[];
  const currentInPortCount = await fetchCurrentInPortCount(db);
  const forecast = rows.map((r) => ({
    time: new Date(r.bucket_time).toISOString(),
    ...computePortCongestionBreakdown(r.arrivals, currentInPortCount, BUSAN_PORT),
  }));

  const nowHour = new Date();
  nowHour.setMinutes(0, 0, 0);
  const current = forecast.find((p) => p.time === nowHour.toISOString());
  const currentFallback = computePortCongestionBreakdown(0, currentInPortCount, BUSAN_PORT);

  return {
    port: BUSAN_PORT.name,
    currentLevel: current?.level ?? currentFallback.level,
    forecast,
    source: "port-mis",
    basis: "port-mis-arrivals-and-current-in-port",
    lastUpdated: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : undefined,
  };
}
