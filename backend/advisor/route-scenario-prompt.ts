import type { RouteScenarioShipResult } from "@/backend/prediction/routes/route-recommendation";

function routeLine(route: RouteScenarioShipResult["routeScenarios"][number]): string {
  return [
    `- ${route.routeName}`,
    `rank=${route.rank}`,
    `recommended=${route.isRecommended}`,
    `score=${route.score}`,
    `distanceNm=${route.distanceNm}`,
    `eta=${route.eta}`,
    `congestion=${Math.round(route.congestionLevel * 100)}%/${route.congestionStatus}`,
    `waitingMinutes=${route.estimatedWaitingMinutes}`,
    `recommendedSpeedKn=${route.recommendedSpeedKn}`,
    `fuelSavedKg=${route.estimatedFuelSavedKg}`,
    `co2ReducedKg=${route.estimatedCo2ReducedKg}`,
  ].join(", ");
}

export function buildRouteScenarioAdvisorPrompt(result: RouteScenarioShipResult): string {
  const recommended = result.routeScenarios.find((route) => route.isRecommended);
  const alternatives = result.routeScenarios.filter((route) => !route.isRecommended);
  const warnings = [
    ...(recommended?.warnings ?? []),
    ...result.warnings,
  ]
    .filter(Boolean)
    .slice(0, 5)
    .map((warning) => `- ${warning}`)
    .join("\n");
  const basis = (recommended?.calculationBasis ?? [])
    .slice(0, 6)
    .map((item) => `- ${item}`)
    .join("\n");

  return `당신은 부산항 입항 시나리오를 검토하는 운영자용 설명 어시스턴트입니다.
아래 결정론적 계산 결과를 바탕으로 설명만 작성하세요.

중요 규칙:
- 숫자는 입력된 계산값만 사용하고 새 수치를 만들지 마세요.
- 추천 순위와 추천 경로를 바꾸지 마세요.
- isRecommended=true인 경로를 추천 경로로 설명하세요.
- 실제 항해 지시가 아니라 사전 정의 접근 경로 후보 비교 시뮬레이션임을 명시하세요.
- "정확히 최적" 대신 "현재 시뮬레이션 기준 가장 유리한 후보"라고 표현하세요.
- 관제, 도선, 예선, 기상, 수심, 선박 안전 조건은 실제 운영자가 확인해야 한다고 명시하세요.
- JSON 객체만 출력하고 코드 블록은 쓰지 마세요.

## 선박
- shipName=${result.shipName}
- scenarioSource=${result.scenarioSource ?? "manual"}
- destinationPortName=${result.destinationPortName}

## 추천 경로
${recommended ? routeLine(recommended) : "- 없음"}

## 대안 경로
${alternatives.length ? alternatives.map(routeLine).join("\n") : "- 없음"}

## 계산 근거
${basis || "- 없음"}

## 주의사항
${warnings || "- 본 결과는 운영자 검토용 시뮬레이션입니다."}

## 출력 JSON 스키마
{
  "summary": "한 문장 요약",
  "recommendation": "추천 경로와 이유를 한두 문장으로 설명",
  "comparison": ["대안 경로와의 비교 bullet", "대안 경로와의 비교 bullet"],
  "reasons": ["추천 사유", "추천 사유"],
  "risks": ["주의사항", "주의사항"],
  "disclaimer": "본 경로 추천은 사전 정의된 접근 경로 후보를 비교한 시뮬레이션 결과이며 실제 항해 지시가 아닙니다."
}`;
}
