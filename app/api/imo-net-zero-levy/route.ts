import { computeImoNetZeroLevy, type ImoNzfFuelType } from "@/backend/prediction/imo-net-zero-levy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IMO Net-Zero Framework(2028년 실부과 시작) 탄소부담금 계산 엔드포인트 — 모델 탑재만.
// 실제 화면 연동은 추후.
//   GET /api/imo-net-zero-levy?gt=50000&fuel=MGO&fuelTon=1000&year=2028
//   응답: ImoNetZeroLevyResult (달성 GFI vs Base/Direct Compliance Target,
//         Tier1/Tier2 부족톤수 + 부담금 USD(2028-2030만 가격 확정))
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const grossTonnage = Number(params.get("gt") ?? params.get("grossTonnage"));
  const fuelConsumptionTon = Number(params.get("fuelTon") ?? params.get("fuelConsumptionTon"));
  const yearRaw = params.get("year");
  const fuelRaw = (params.get("fuel") ?? "MGO").toUpperCase();

  if (!Number.isFinite(grossTonnage) || grossTonnage <= 0) {
    return Response.json({ error: "gt(총톤수) 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!Number.isFinite(fuelConsumptionTon) || fuelConsumptionTon <= 0) {
    return Response.json({ error: "fuelTon(연료 소비량, 톤) 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }
  if (fuelRaw !== "MGO" && fuelRaw !== "VLSFO") {
    return Response.json(
      { error: "fuel은 MGO 또는 VLSFO만 지원합니다. LNG는 IMO WtT 계수 미확정으로 미지원." },
      { status: 400 }
    );
  }
  const year = yearRaw != null && Number.isFinite(Number(yearRaw)) ? Number(yearRaw) : new Date().getFullYear();

  const result = computeImoNetZeroLevy({
    fuelType: fuelRaw as ImoNzfFuelType,
    fuelConsumptionTon,
    grossTonnage,
    year,
  });
  return Response.json(result);
}
