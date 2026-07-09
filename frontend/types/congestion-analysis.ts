export type CongestionAnalysisRiskLevel = "low" | "medium" | "high";

export interface CongestionAnalysisSnapshotPort {
  portId: string;
  portName: string;
  congestionLevel: number;
  congestionStatus: string;
  aisShipCount?: number;
  inboundCount24h?: number;
  outboundCount24h?: number;
  anchoredCount?: number;
  berthedCount?: number;
  underwayCount?: number;
  estimatedWaitingMinutes?: number;
}

export interface CongestionAnalysisSnapshot {
  generatedAt: string;
  ports: CongestionAnalysisSnapshotPort[];
  trends?: Array<{
    label: string;
    portId?: string;
    congestionLevel: number;
    inboundCount?: number;
    outboundCount?: number;
    aisShipCount?: number;
  }>;
  energySummary?: {
    candidateCount: number;
    recommendedCount: number;
    totalReducedWaitingMinutes?: number;
    totalEstimatedCo2ReducedKg?: number;
  };
  forecastFreshness?: {
    isStale: boolean;
    reason?: string;
    forecastStart?: string;
    forecastEnd?: string;
  };
  dataSources: string[];
  limitations: string[];
}

export interface AiCongestionPortInsight {
  portId: string;
  portName: string;
  congestionLevel: number;
  congestionStatus: string;
  mainCause: string;
  suggestedAction: string;
}

export interface AiCongestionAnalysisResult {
  source: "openai" | "rule-based-fallback";
  riskLevel: CongestionAnalysisRiskLevel;
  headline: string;
  summary: string;
  causes: string[];
  portInsights: AiCongestionPortInsight[];
  riskTimeWindows: string[];
  recommendedActions: string[];
  limitations: string[];
  disclaimer: string;
}

export interface CongestionAnalysisApiResponse {
  source: "openai" | "rule-based-fallback";
  isFallback: boolean;
  lastUpdated: string;
  basis: "ai-congestion-cause-analysis";
  dataSources: string[];
  snapshot: CongestionAnalysisSnapshot;
  analysis: AiCongestionAnalysisResult;
  calculationNote: string;
}
