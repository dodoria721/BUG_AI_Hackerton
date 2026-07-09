// 조위 실측·예측 조회 API. backend/marine/tide.ts 참고.
// 두 시계열을 함께 내려 프론트에서 실측/예측을 이어 그릴 수 있게 한다.

import { fetchTideObservation, fetchTidePrediction } from "@/backend/marine/tide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const [observation, prediction] = await Promise.all([fetchTideObservation(), fetchTidePrediction()]);
    if (!observation && !prediction) {
      return Response.json(
        { error: "KHOA_API_KEY 또는 관측소 코드가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    return Response.json({ observation, prediction });
  } catch (err) {
    console.error("[/api/marine/tide]", err);
    const message = err instanceof Error ? err.message : "조위 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
