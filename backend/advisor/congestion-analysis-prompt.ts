import type { CongestionAnalysisSnapshot } from "./congestion-analysis-types";

function compactSnapshot(snapshot: CongestionAnalysisSnapshot) {
  return {
    generatedAt: snapshot.generatedAt,
    ports: snapshot.ports,
    trends: snapshot.trends?.slice(0, 24),
    energySummary: snapshot.energySummary,
    forecastFreshness: snapshot.forecastFreshness,
    dataSources: snapshot.dataSources,
    limitations: snapshot.limitations,
  };
}

export function buildCongestionAnalysisPrompt(snapshot: CongestionAnalysisSnapshot): string {
  return `You are an AI assistant for Busan Port congestion analysis.
Write a Korean operator-review explanation for the current congestion causes.

Important rules:
- Do not calculate new numeric values.
- Use only the backend-computed values in the provided JSON.
- Do not invent congestion levels, ship counts, inbound counts, waiting minutes, or time windows.
- Do not reorder, rename, add, or remove ports beyond the snapshot ports.
- If evidence is weak, say it is an inference or needs operator confirmation.
- This is not a navigation instruction, automatic control command, or safety guarantee.
- Say that operators must verify weather, VTS, pilotage, channel, berth, and safety conditions.
- Output only a JSON object. Do not wrap it in markdown.

Required JSON shape:
{
  "riskLevel": "low" | "medium" | "high",
  "headline": "short Korean headline",
  "summary": "2-3 sentence Korean summary",
  "causes": ["cause grounded in snapshot"],
  "portInsights": [
    {
      "portId": "same as snapshot portId",
      "portName": "same as snapshot portName",
      "congestionLevel": 0.72,
      "congestionStatus": "same as snapshot",
      "mainCause": "Korean cause grounded in snapshot",
      "suggestedAction": "Korean operator-review action"
    }
  ],
  "riskTimeWindows": ["time-window explanation grounded in trends"],
  "recommendedActions": ["operator-review action"],
  "limitations": ["data limitation"],
  "disclaimer": "AI 분석은 AIS, Port-MIS, 혼잡도 계산 결과를 바탕으로 생성한 운영자 검토용 설명이며 실제 항해 지시가 아닙니다."
}

Backend-computed snapshot:
${JSON.stringify(compactSnapshot(snapshot), null, 2)}`;
}
