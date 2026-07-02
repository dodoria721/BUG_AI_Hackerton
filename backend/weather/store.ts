// 단기예보를 Supabase weather_forecasts 테이블에 저장한다.
// DB 미설정/오류면 조용히 건너뛴다(앱 동작에 영향 없음).

import { getSupabase } from "../db/supabase";
import type { WeatherForecast } from "./types";

interface WeatherRow {
  nx: number;
  ny: number;
  fcst_at: string;
  base_at: string;
  temp_c: number | null;
  sky: number | null;
  pty: number | null;
  pop: number | null;
  precip: string | null;
  humidity: number | null;
  wind_speed: number | null;
  wind_deg: number | null;
  wave_m: number | null;
}

function toRows(f: WeatherForecast): WeatherRow[] {
  return f.points.map((p) => ({
    nx: f.grid.nx,
    ny: f.grid.ny,
    fcst_at: p.time,
    base_at: f.baseTime,
    temp_c: p.tempC ?? null,
    sky: p.sky ?? null,
    pty: p.pty ?? null,
    pop: p.pop ?? null,
    precip: p.precip ?? null,
    humidity: p.humidity ?? null,
    wind_speed: p.windSpeed ?? null,
    wind_deg: p.windDeg ?? null,
    wave_m: p.waveM ?? null,
  }));
}

export async function saveForecast(
  f: WeatherForecast
): Promise<{ saved: number } | { error: string }> {
  const db = getSupabase();
  if (!db) return { error: "Supabase 미설정" };

  const rows = toRows(f);
  const { error } = await db.from("weather_forecasts").upsert(rows, { onConflict: "nx,ny,fcst_at" });
  if (error) return { error: error.message };
  return { saved: rows.length };
}
