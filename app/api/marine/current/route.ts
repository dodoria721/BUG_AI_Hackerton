// 조류예보 시계열 조회 API (선택 항목). backend/marine/current.ts 참고.

import { fetchTidalCurrentForecast } from "@/backend/marine/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const forecast = await fetchTidalCurrentForecast();
    if (!forecast) {
      return Response.json(
        { error: "KHOA_API_KEY 또는 관측소 코드가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    return Response.json(forecast);
  } catch (err) {
    console.error("[/api/marine/current]", err);
    const message = err instanceof Error ? err.message : "조류예보 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
