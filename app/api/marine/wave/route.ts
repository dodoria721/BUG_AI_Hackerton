// 실측 파랑(유의파고) 조회 API. backend/marine/wave.ts 참고.

import { fetchWaveObservation } from "@/backend/marine/wave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const observation = await fetchWaveObservation();
    if (!observation) {
      return Response.json(
        { error: "KHOA_API_KEY 또는 관측소 코드가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    return Response.json(observation);
  } catch (err) {
    console.error("[/api/marine/wave]", err);
    const message = err instanceof Error ? err.message : "파랑 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
