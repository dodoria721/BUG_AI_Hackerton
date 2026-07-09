import { fetchShips } from "@/backend/ais/ship-source";
import { buildDemoCollisionShips } from "@/backend/ais/demo-collision-ships";
import { detectCloseQuarters } from "@/backend/prediction/collision-risk";
import { BUSAN_PORT } from "@/backend/ports/seed-port";

export const runtime = "nodejs";
// /api/ships 와 동일 이유로 캐시를 끈다 — 실시간 위치가 바뀌어도 응답이 굳지 않도록.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// 응답 alerts 최대 개수(심각도순 상위). 붐비는 실 AIS에서 수백~수천 건이 나와도 관제 화면은 상위만 본다.
const MAX_ALERTS = 100;

// 근접 충돌위험(CPA/TCPA) 경보.
//   GET /api/collision-risk            → 실 선박 + 데모 충돌 선박 주입(기본)
//   GET /api/collision-risk?demo=0     → 실 선박만
//   GET /api/collision-risk?demoOnly=1 → 데모 선박만 평가(발표용, 잡음 없이 정면·추월 시나리오만)
//
// 응답: { alerts, totalAlerts, demoShips, demo, generatedAt }.
//   - alerts: 심각도순 상위 MAX_ALERTS 건.
//   - demoShips: 주입한 데모 선박(지도에 덧그릴 수 있게). 실 선박은 관제 페이지가 기존
//     /api/ships 로 이미 받으므로 여기서 다시 싣지 않는다(응답 경량화).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const demoOnly = params.get("demoOnly") === "1";
  const demo = demoOnly || params.get("demo") !== "0";

  const real = demoOnly ? [] : await fetchShips();
  const demoShips = demo ? buildDemoCollisionShips(BUSAN_PORT) : [];
  const alerts = detectCloseQuarters([...real, ...demoShips], BUSAN_PORT);

  return Response.json({
    alerts: alerts.slice(0, MAX_ALERTS),
    totalAlerts: alerts.length,
    demoShips,
    demo,
    generatedAt: new Date().toISOString(),
  });
}
