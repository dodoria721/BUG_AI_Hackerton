import type {
  AiCongestionAnalysisResult,
  AiCongestionPortInsight,
  CongestionAnalysisRiskLevel,
  CongestionAnalysisSnapshotPort,
} from "./congestion-analysis-types";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function riskLevel(value: unknown): CongestionAnalysisRiskLevel | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function stringArray(value: unknown, max = 8): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length === value.length ? strings.slice(0, max) : null;
}

function portInsights(value: unknown, allowedPorts: CongestionAnalysisSnapshotPort[]): AiCongestionPortInsight[] | null {
  if (!Array.isArray(value)) return null;
  const byId = new Map(allowedPorts.map((port) => [port.portId, port]));
  const insights: AiCongestionPortInsight[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const insight = item as Record<string, unknown>;
    if (
      typeof insight.portId !== "string" ||
      typeof insight.mainCause !== "string" ||
      typeof insight.suggestedAction !== "string"
    ) {
      return null;
    }
    const sourcePort = byId.get(insight.portId);
    if (!sourcePort) return null;
    insights.push({
      portId: sourcePort.portId,
      portName: sourcePort.portName,
      congestionLevel: sourcePort.congestionLevel,
      congestionStatus: sourcePort.congestionStatus,
      mainCause: insight.mainCause,
      suggestedAction: insight.suggestedAction,
    });
  }

  return insights;
}

export function parseCongestionAnalysisResult(
  rawText: string,
  allowedPorts: CongestionAnalysisSnapshotPort[]
): AiCongestionAnalysisResult | null {
  try {
    const parsed = JSON.parse(extractJson(rawText));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    const parsedRiskLevel = riskLevel(value.riskLevel);
    const causes = stringArray(value.causes);
    const insights = portInsights(value.portInsights, allowedPorts);
    const riskTimeWindows = stringArray(value.riskTimeWindows);
    const recommendedActions = stringArray(value.recommendedActions);
    const limitations = stringArray(value.limitations);

    if (
      !parsedRiskLevel ||
      typeof value.headline !== "string" ||
      typeof value.summary !== "string" ||
      !causes ||
      !insights ||
      !riskTimeWindows ||
      !recommendedActions ||
      !limitations ||
      typeof value.disclaimer !== "string"
    ) {
      return null;
    }

    return {
      source: "openai",
      riskLevel: parsedRiskLevel,
      headline: value.headline,
      summary: value.summary,
      causes,
      portInsights: insights,
      riskTimeWindows,
      recommendedActions,
      limitations,
      disclaimer: value.disclaimer,
    };
  } catch {
    return null;
  }
}
