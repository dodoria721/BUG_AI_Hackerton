export interface RouteScenarioAdvisorResult {
  source: "openai" | "rule-based-fallback";
  summary: string;
  recommendation: string;
  comparison: string[];
  reasons: string[];
  risks: string[];
  disclaimer: string;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length === value.length ? strings.slice(0, 6) : null;
}

export function parseRouteScenarioAdvisorResult(rawText: string): RouteScenarioAdvisorResult | null {
  try {
    const parsed = JSON.parse(extractJson(rawText));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    const comparison = stringArray(value.comparison);
    const reasons = stringArray(value.reasons);
    const risks = stringArray(value.risks);
    if (
      typeof value.summary !== "string" ||
      typeof value.recommendation !== "string" ||
      typeof value.disclaimer !== "string" ||
      !comparison ||
      !reasons ||
      !risks
    ) {
      return null;
    }

    return {
      source: "openai",
      summary: value.summary,
      recommendation: value.recommendation,
      comparison,
      reasons,
      risks,
      disclaimer: value.disclaimer,
    };
  } catch {
    return null;
  }
}
