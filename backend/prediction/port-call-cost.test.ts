import assert from "node:assert/strict";
import { BUSAN_PORT } from "../ports/seed-port";
import { computePortCallCost } from "./port-call-cost";

// ── 1) 종합: totalUsd = 연료비 + 정박료(mooringFeeUsdApprox), 항해구간 없으면 voyageFuel=null ──
{
  const r = computePortCallCost(
    { vesselType: "컨테이너선", grossTonnage: 50000, berthHours: 24, year: 2026 },
    BUSAN_PORT
  );
  const sum = (r.voyageFuel?.costUsd ?? 0) + r.hotelingFuel.costUsd + r.portDue.mooringFeeUsdApprox;
  assert.equal(r.voyageFuel, null, "distanceNm 없으면 항해연료 없음");
  assert.ok(Math.abs(r.totalUsd - sum) < 1, "totalUsd = 연료비 + 정박료");
  assert.ok(r.totalUsd > 0);
}

// ── 2) 탄소 그림자가격은 totalUsd에 섞이지 않고 totalWithCarbonShadowUsd에만 별도로 더해진다 ──
{
  const r = computePortCallCost({ vesselType: "탱커", grossTonnage: 60000, berthHours: 24 }, BUSAN_PORT);
  assert.ok(r.portDue.carbonShadowCostUsd > 0, "그림자가격 자체는 양수");
  assert.ok(
    Math.abs(r.totalWithCarbonShadowUsd - (r.totalUsd + r.portDue.carbonShadowCostUsd)) < 1,
    "totalWithCarbonShadowUsd = totalUsd + 그림자가격"
  );
  assert.notEqual(r.totalUsd, r.totalWithCarbonShadowUsd, "실비용과 참고 시나리오는 다른 값");
}

// ── 3) distanceNm이 있으면 항해연료비가 포함되어 총액이 커진다 ──
{
  const withoutVoyage = computePortCallCost({ vesselType: "탱커", grossTonnage: 60000, berthHours: 24 }, BUSAN_PORT);
  const withVoyage = computePortCallCost(
    { vesselType: "탱커", grossTonnage: 60000, berthHours: 24, distanceNm: 200, speedKn: 12 },
    BUSAN_PORT
  );
  assert.ok(withVoyage.voyageFuel != null && withVoyage.voyageFuel.costUsd > 0);
  assert.ok(withVoyage.totalUsd > withoutVoyage.totalUsd, "항해연료비만큼 총액 증가");
}

// ── 4) 외항선/내항선 요율 차이가 총액에 그대로 반영된다(정박료 파트) ──
{
  const foreign = computePortCallCost({ grossTonnage: 50000, berthHours: 24, isForeignGoing: true }, BUSAN_PORT);
  const coastal = computePortCallCost({ grossTonnage: 50000, berthHours: 24, isForeignGoing: false }, BUSAN_PORT);
  assert.ok(foreign.totalUsd > coastal.totalUsd, "외항선 정박료가 더 높아 총액도 더 큼");
}

console.log("port-call-cost validation passed");
