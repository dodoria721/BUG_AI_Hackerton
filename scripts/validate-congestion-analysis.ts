import assert from "node:assert/strict";
import { buildCongestionAnalysisFallback } from "../backend/advisor/congestion-analysis-advisor";
import { parseCongestionAnalysisResult } from "../backend/advisor/congestion-analysis-parse";
import type { CongestionAnalysisSnapshot } from "../backend/advisor/congestion-analysis-types";

const snapshot: CongestionAnalysisSnapshot = {
  generatedAt: "2026-07-09T00:00:00.000Z",
  ports: [
    {
      portId: "busan-new",
      portName: "부산신항",
      congestionLevel: 0.91,
      congestionStatus: "혼잡",
      aisShipCount: 220,
      inboundCount24h: 8,
      outboundCount24h: 4,
      anchoredCount: 3,
      berthedCount: 5,
      estimatedWaitingMinutes: 60,
    },
    {
      portId: "gamcheon",
      portName: "감천항",
      congestionLevel: 0.42,
      congestionStatus: "보통",
      aisShipCount: 90,
      inboundCount24h: 2,
      outboundCount24h: 1,
      estimatedWaitingMinutes: 15,
    },
  ],
  trends: [
    { label: "부산신항 14:00", portId: "busan-new", congestionLevel: 0.91, inboundCount: 3, aisShipCount: 220 },
    { label: "감천항 14:00", portId: "gamcheon", congestionLevel: 0.42, inboundCount: 1, aisShipCount: 90 },
  ],
  energySummary: {
    candidateCount: 4,
    recommendedCount: 2,
    totalReducedWaitingMinutes: 80,
    totalEstimatedCo2ReducedKg: 3200,
  },
  dataSources: ["test"],
  limitations: ["test limitation"],
};

const fallback = buildCongestionAnalysisFallback(snapshot);
assert.equal(fallback.source, "rule-based-fallback");
assert.equal(fallback.riskLevel, "high");
assert.equal(fallback.portInsights.length, snapshot.ports.length);
assert.ok(fallback.disclaimer.includes("실제 항해 지시가 아닙니다"));
assert.ok(fallback.riskTimeWindows.length > 0);

const emptyFallback = buildCongestionAnalysisFallback({ ...snapshot, ports: [], trends: [] });
assert.equal(emptyFallback.riskLevel, "low");
assert.equal(emptyFallback.portInsights.length, 0);

const parsed = parseCongestionAnalysisResult(
  JSON.stringify({
    riskLevel: "medium",
    headline: "테스트",
    summary: "요약",
    causes: ["원인"],
    portInsights: [
      {
        portId: "busan-new",
        portName: "임의 이름은 무시",
        congestionLevel: 0,
        congestionStatus: "임의 상태는 무시",
        mainCause: "입항 신고 집중 가능성",
        suggestedAction: "운영자 검토",
      },
    ],
    riskTimeWindows: ["14:00"],
    recommendedActions: ["검토"],
    limitations: ["제약"],
    disclaimer: "AI 분석은 AIS, Port-MIS, 혼잡도 계산 결과를 바탕으로 생성한 운영자 검토용 설명이며 실제 항해 지시가 아닙니다.",
  }),
  snapshot.ports
);

assert.ok(parsed);
assert.equal(parsed.source, "openai");
assert.equal(parsed.portInsights[0].portName, "부산신항");
assert.equal(parsed.portInsights[0].congestionLevel, 0.91);

const invalidPort = parseCongestionAnalysisResult(
  JSON.stringify({
    riskLevel: "medium",
    headline: "테스트",
    summary: "요약",
    causes: ["원인"],
    portInsights: [{ portId: "unknown", mainCause: "x", suggestedAction: "y" }],
    riskTimeWindows: ["14:00"],
    recommendedActions: ["검토"],
    limitations: ["제약"],
    disclaimer: "x",
  }),
  snapshot.ports
);
assert.equal(invalidPort, null);

console.log("congestion analysis validation passed");
