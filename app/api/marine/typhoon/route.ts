// 태풍정보(위험 알림) 조회 API. backend/marine/typhoon.ts 참고.

import { fetchActiveTyphoons } from "@/backend/marine/typhoon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const typhoons = await fetchActiveTyphoons();
    if (!typhoons) {
      return Response.json({ error: "KMA_TYPHOON_KEY가 설정되지 않았습니다." }, { status: 503 });
    }
    return Response.json({ typhoons });
  } catch (err) {
    console.error("[/api/marine/typhoon]", err);
    const message = err instanceof Error ? err.message : "태풍정보 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
