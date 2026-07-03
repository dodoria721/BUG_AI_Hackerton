import { fetchShips } from "@/backend/ais/ship-source";

export const runtime = "nodejs";
// Next.js는 Route Handler 안에서 일어나는 fetch(supabase-js가 내부적으로 쓰는 fetch 포함)를
// 기본적으로 캐싱한다 — 이걸 안 끄면 Vercel에서 DB가 바뀌어도 응답이 그대로 굳는다.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const ships = await fetchShips();
  return Response.json(ships);
}
