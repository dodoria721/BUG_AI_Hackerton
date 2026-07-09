import { generateText } from "ai";
import { advisorModel } from "@/backend/models";
import { buildCongestionAnalysisPrompt } from "./congestion-analysis-prompt";
import { parseCongestionAnalysisResult } from "./congestion-analysis-parse";
import type {
  AiCongestionAnalysisResult,
  CongestionAnalysisRiskLevel,
  CongestionAnalysisSnapshot,
  CongestionAnalysisSnapshotPort,
} from "./congestion-analysis-types";

export type { AiCongestionAnalysisResult } from "./congestion-analysis-types";

export const CONGESTION_ANALYSIS_DISCLAIMER =
  "AI 분석은 AIS, Port-MIS, 혼잡도 계산 결과를 바탕으로 생성한 운영자 검토용 설명이며 실제 항해 지시가 아닙니다.";

function riskLevel(snapshot: CongestionAnalysisSnapshot): CongestionAnalysisRiskLevel {
  const maxLevel = Math.max(0, ...snapshot.ports.map((port) => port.congestionLevel));
  if (maxLevel >= 0.85) return "high";
  if (maxLevel >= 0.6) return "medium";
  return "low";
}

function strongestPort(snapshot: CongestionAnalysisSnapshot): CongestionAnalysisSnapshotPort | undefined {
  return [...snapshot.ports].sort((a, b) => b.congestionLevel - a.congestionLevel)[0];
}

function causeForPort(port: CongestionAnalysisSnapshotPort): string {
  const hints: string[] = [];
  if ((port.inboundCount24h ?? 0) > 0) hints.push(`최근 입항 신고 ${port.inboundCount24h}건`);
  if ((port.aisShipCount ?? 0) > 0) hints.push(`AIS 권역 선박 ${port.aisShipCount}척`);
  if ((port.anchoredCount ?? 0) > 0) hints.push(`묘박/대기 추정 ${port.anchoredCount}척`);
  if ((port.berthedCount ?? 0) > 0) hints.push(`접안 추정 ${port.berthedCount}척`);
  if (!hints.length) return "혼잡 원인을 확정하기에는 보조 지표가 제한적입니다.";
  return `${hints.join(", ")}이 혼잡 상승 요인으로 추정됩니다.`;
}

function actionForPort(port: CongestionAnalysisSnapshotPort): string {
  if (port.congestionLevel >= 0.85) return "입항 예정 선박, 도선, 선석 운영 조건을 우선 재확인하세요.";
  if (port.congestionLevel >= 0.6) return "입항 예정과 현재 권역 선박 분포를 운영자 검토 대상으로 두세요.";
  return "현재는 모니터링 중심으로 유지하되 데이터 최신성을 확인하세요.";
}

function riskWindows(snapshot: CongestionAnalysisSnapshot): string[] {
  const highTrends = [...(snapshot.trends ?? [])]
    .filter((trend) => trend.congestionLevel >= 0.6)
    .sort((a, b) => b.congestionLevel - a.congestionLevel)
    .slice(0, 5)
    .map((trend) => `${trend.label}: 혼잡도 ${Math.round(trend.congestionLevel * 100)}%`);

  if (highTrends.length) return highTrends;
  return ["시간대별 고위험 구간이 뚜렷하지 않아 현재 혼잡도와 지역별 지표를 중심으로 검토하세요."];
}

export function buildCongestionAnalysisFallback(snapshot: CongestionAnalysisSnapshot): AiCongestionAnalysisResult {
  const topPort = strongestPort(snapshot);
  const risk = riskLevel(snapshot);
  const hasJitTargets = (snapshot.energySummary?.recommendedCount ?? 0) > 0;

  return {
    source: "rule-based-fallback",
    riskLevel: risk,
    headline: topPort
      ? `${topPort.portName} 혼잡도 ${Math.round(topPort.congestionLevel * 100)}% 기준 운영 검토 필요`
      : "혼잡도 데이터 확인 필요",
    summary: topPort
      ? `현재 항만별 혼잡도와 AIS/Port-MIS 지표를 기준으로 ${topPort.portName}의 혼잡 가능성이 가장 높게 나타납니다. 본 분석은 백엔드 계산 결과를 해석한 참고 설명입니다.`
      : "현재 항만별 혼잡도 데이터가 충분하지 않아 원인 분석은 제한적으로만 제공됩니다.",
    causes: [
      topPort
        ? `${topPort.portName}의 현재 혼잡도는 ${Math.round(topPort.congestionLevel * 100)}%이며 상태는 ${topPort.congestionStatus}입니다.`
        : "분석 가능한 항만별 혼잡도 데이터가 제한적입니다.",
      hasJitTargets
        ? `JIT 감속 권고 대상 ${snapshot.energySummary?.recommendedCount}척이 있어 권고 속도와 ETA 검토가 필요합니다.`
        : "현재 JIT 감속 권고 대상은 없거나 제한적으로 나타납니다.",
      "입항 신고, AIS 권역 선박 수, 정박/접안 추정 지표를 함께 확인해야 합니다.",
    ],
    portInsights: snapshot.ports.map((port) => ({
      portId: port.portId,
      portName: port.portName,
      congestionLevel: port.congestionLevel,
      congestionStatus: port.congestionStatus,
      mainCause: causeForPort(port),
      suggestedAction: actionForPort(port),
    })),
    riskTimeWindows: riskWindows(snapshot),
    recommendedActions: [
      "혼잡도가 높은 항만의 입항 예정 선박과 현재 권역 선박 분포를 우선 확인하세요.",
      "JIT 감속 권고 대상 선박이 있으면 권고 속도, ETA, 기상, VTS 조건을 함께 검토하세요.",
      "기상, 도선, 예선, 선석 운영 상황은 실제 운영자가 별도로 확인해야 합니다.",
    ],
    limitations: [
      "본 분석은 현재 수집된 AIS, Port-MIS, 혼잡도 계산 결과에 기반합니다.",
      "원인 분석은 추정이며 실제 항만 운영 판단에는 현장 조건 확인이 필요합니다.",
      ...snapshot.limitations.slice(0, 3),
    ],
    disclaimer: CONGESTION_ANALYSIS_DISCLAIMER,
  };
}

export async function generateCongestionAnalysis(
  snapshot: CongestionAnalysisSnapshot
): Promise<AiCongestionAnalysisResult> {
  if (!process.env.OPENAI_API_KEY) return buildCongestionAnalysisFallback(snapshot);

  try {
    const { text } = await generateText({
      model: advisorModel,
      prompt: buildCongestionAnalysisPrompt(snapshot),
    });
    return parseCongestionAnalysisResult(text, snapshot.ports) ?? buildCongestionAnalysisFallback(snapshot);
  } catch (error) {
    console.error("[congestion-analysis-advisor]", error);
    return buildCongestionAnalysisFallback(snapshot);
  }
}
