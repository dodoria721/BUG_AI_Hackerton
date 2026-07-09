import { estimateBerthEmission } from "@/backend/prediction/berth-emission-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 선박별 접안(정박) 중 연료소비·탄소배출 추정 엔드포인트 — 모델 탑재만. 실제 화면 연동은 추후.
//   GET /api/berth-emission?type=컨테이너선&gt=50000&berthHours=24
//   응답: BerthEmissionEstimate (fuelConsumptionTon=근사치, co2eqTon=IMO 실측 WtW 계수 기반)
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const berthHoursRaw = params.get("berthHours");
  const berthHours = berthHoursRaw != null ? Number(berthHoursRaw) : NaN;
  if (!Number.isFinite(berthHours) || berthHours < 0) {
    return Response.json({ error: "berthHours(접안 시간) 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const vesselType = params.get("type") ?? params.get("vesselType") ?? undefined;
  const gtRaw = params.get("gt") ?? params.get("grossTonnage");
  const grossTonnage = gtRaw != null && Number.isFinite(Number(gtRaw)) ? Number(gtRaw) : undefined;

  const result = estimateBerthEmission({ vesselType, grossTonnage, berthHours });
  return Response.json(result);
}
