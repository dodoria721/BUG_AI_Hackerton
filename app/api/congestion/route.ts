import { resolveCongestion } from "@/backend/congestion/resolve-congestion";

export const runtime = "nodejs";
// ships/route.ts와 동일한 이유 — Supabase 조회가 fetch 기반이라 캐싱을 명시적으로 꺼야 한다.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// 혼잡도는 통계 기반으로만 계산한다(실시간 선박 위치 기반 아님).
// 현재=해수부 연안AIS 통계 밀도, 미래=Port-MIS 입항 예측. 소스 선택은 resolveCongestion 참고.
export async function GET() {
  return Response.json(await resolveCongestion());
}
