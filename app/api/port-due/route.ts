import { computeCarbonPortDue } from "@/backend/prediction/carbon-port-due";
import { BUSAN_PORT } from "@/backend/ports/seed-port";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 정박료(해양수산부 고시 실제 요율) + 탄소 그림자가격(참고) 계산 엔드포인트 — 모델 탑재만.
// 실제 화면 연동은 추후.
//   GET /api/port-due?gt=50000&type=컨테이너선&berthHours=24&foreign=1&year=2026
//   응답: CarbonPortDue (mooringFeeKrw=실제 정박료, carbonShadowCostUsd=참고 시나리오)
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const grossTonnage = Number(params.get("gt") ?? params.get("grossTonnage"));
  if (!Number.isFinite(grossTonnage) || grossTonnage <= 0) {
    return Response.json({ error: "gt(총톤수) 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const vesselType = params.get("type") ?? params.get("vesselType") ?? undefined;
  const berthHoursRaw = params.get("berthHours");
  const yearRaw = params.get("year");
  const foreignRaw = params.get("foreign");
  const berthHours = berthHoursRaw != null && Number.isFinite(Number(berthHoursRaw)) ? Number(berthHoursRaw) : undefined;
  const year = yearRaw != null && Number.isFinite(Number(yearRaw)) ? Number(yearRaw) : undefined;
  const isForeignGoing = foreignRaw != null ? foreignRaw !== "0" : undefined;

  const result = computeCarbonPortDue({ vesselType, grossTonnage, berthHours, isForeignGoing, year }, BUSAN_PORT);
  return Response.json(result);
}
