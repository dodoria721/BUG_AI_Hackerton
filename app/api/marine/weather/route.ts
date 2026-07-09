// 해양기상(NMPNT 관측지점) 조회 API. backend/marine/weather.ts 참고.
// ?date=YYYYMMDD 쿼리가 있으면 날짜별 조회, 없으면 최신 조회.

import { fetchMarineWeather, fetchMarineWeatherByDate } from "@/backend/marine/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date");
    const observation = date ? await fetchMarineWeatherByDate(date) : await fetchMarineWeather();
    if (!observation) {
      return Response.json(
        { error: "NMPNT_MARINE_WEATHER_KEY 또는 관측지점 코드가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    return Response.json(observation);
  } catch (err) {
    console.error("[/api/marine/weather]", err);
    const message = err instanceof Error ? err.message : "해양기상 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
