// 선박운항지수 조회 API (선택 항목). backend/marine/operationIndex.ts 참고.

import { fetchShipOperationIndex } from "@/backend/marine/operationIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const index = await fetchShipOperationIndex();
    if (!index) {
      return Response.json(
        { error: "KHOA_API_KEY가 설정되지 않았습니다." },
        { status: 503 }
      );
    }
    return Response.json(index);
  } catch (err) {
    console.error("[/api/marine/operation-index]", err);
    const message = err instanceof Error ? err.message : "선박운항지수 조회 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}
