import { fetchShips } from "@/backend/ais/ship-source";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import { computeCongestionForecast } from "@/backend/prediction/congestion";

export const runtime = "nodejs";
// ships/route.ts와 동일한 이유 — Supabase 조회가 fetch 기반이라 캐싱을 명시적으로 꺼야 한다.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const ships = await fetchShips();
  const forecast = computeCongestionForecast(ships, BUSAN_PORT);
  return Response.json(forecast);
}
