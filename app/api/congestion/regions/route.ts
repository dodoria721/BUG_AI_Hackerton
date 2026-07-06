import { resolveRegionalCongestion } from "@/backend/congestion/regional-congestion";

export const runtime = "nodejs";
// ships/route.ts와 동일 — Supabase 조회가 fetch 기반이라 캐싱을 명시적으로 끈다.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  return Response.json(await resolveRegionalCongestion());
}
