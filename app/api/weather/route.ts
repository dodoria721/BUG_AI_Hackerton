// 기상청 단기예보를 조회해 반환하고, DB에 스냅샷을 저장(best-effort)한다.

import { fetchShortTermForecast } from "@/backend/weather/kma";
import { saveForecast } from "@/backend/weather/store";

export const runtime = "nodejs";
// ships/route.ts와 동일한 이유 — 내부 fetch(KMA API, Supabase) 캐싱을 명시적으로 끈다.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const forecast = await fetchShortTermForecast();
    if (!forecast) {
      return Response.json(
        { error: "KMA_SERVICE_KEY가 설정되지 않았습니다. .env.local에 키를 추가해주세요." },
        { status: 503 }
      );
    }

    // DB 저장은 실패해도 응답에는 영향 주지 않는다.
    const saved = await saveForecast(forecast);
    if ("error" in saved) {
      console.warn("[/api/weather] DB 저장 건너뜀:", saved.error);
    }

    return Response.json(forecast);
  } catch (err) {
    console.error("[/api/weather]", err);
    const message = err instanceof Error ? err.message : "단기예보 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
