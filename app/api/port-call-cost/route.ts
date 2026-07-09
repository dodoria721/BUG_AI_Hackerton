import { computePortCallCost } from "@/backend/prediction/port-call-cost";
import { BUSAN_PORT } from "@/backend/ports/seed-port";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 입항 1건의 비용(항해·정박 연료비 + 정박료(실제 요율) + 탄소 그림자가격(참고)) 계산 엔드포인트.
// 모델 탑재만 — 실제 화면 연동은 추후.
//   GET /api/port-call-cost?gt=50000&type=컨테이너선&berthHours=24&foreign=1
//                           &distanceNm=200&speedKn=12&year=2026
//   응답: PortCallCostBreakdown (totalUsd=실비용 합계, totalWithCarbonShadowUsd=참고 시나리오 포함)
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const grossTonnage = Number(params.get("gt") ?? params.get("grossTonnage"));
  if (!Number.isFinite(grossTonnage) || grossTonnage <= 0) {
    return Response.json({ error: "gt(총톤수) 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const numOrUndefined = (key: string) => {
    const raw = params.get(key);
    return raw != null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  };
  const foreignRaw = params.get("foreign");

  const vesselType = params.get("type") ?? params.get("vesselType") ?? undefined;
  const result = computePortCallCost(
    {
      vesselType,
      grossTonnage,
      distanceNm: numOrUndefined("distanceNm"),
      speedKn: numOrUndefined("speedKn"),
      berthHours: numOrUndefined("berthHours"),
      isForeignGoing: foreignRaw != null ? foreignRaw !== "0" : undefined,
      year: numOrUndefined("year"),
    },
    BUSAN_PORT
  );
  return Response.json(result);
}
