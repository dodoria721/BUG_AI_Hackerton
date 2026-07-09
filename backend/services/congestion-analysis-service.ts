import {
  generateCongestionAnalysis,
  type AiCongestionAnalysisResult,
} from "@/backend/advisor/congestion-analysis-advisor";
import type {
  CongestionAnalysisApiResponse,
  CongestionAnalysisSnapshot,
  CongestionAnalysisSnapshotPort,
  CongestionAnalysisTrendPoint,
} from "@/backend/advisor/congestion-analysis-types";
import { fetchShips } from "@/backend/ais/ship-source";
import { resolveRegionalCongestion } from "@/backend/congestion/regional-congestion";
import { resolveCongestion } from "@/backend/congestion/resolve-congestion";
import { estimateWaitingMinutesByCongestion } from "@/backend/data/energy";
import { fetchPortCalls } from "@/backend/portmis/portcall-source";
import type { PortCall, RegionCongestionSeries } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import { getLiveEnergyDecisions } from "./energy-decisions-service";

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function kstHourLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function callsForRegion(region: RegionCongestionSeries | undefined, portCalls: PortCall[]): PortCall[] {
  const configRegion = BUSAN_PORT.congestionRegions.find((item) => item.id === region?.id);
  if (!configRegion) return [];
  return portCalls.filter((call) => call.berthAreaId && configRegion.berthAreaIds.includes(call.berthAreaId));
}

function isAnchoredCall(call: PortCall): boolean {
  const text = `${call.berthType ?? ""} ${call.berthName ?? ""}`;
  return /묘|박|정박|anch|臾/i.test(text);
}

function buildPortSnapshots(
  regions: RegionCongestionSeries[],
  portCalls: PortCall[]
): CongestionAnalysisSnapshotPort[] {
  return BUSAN_PORT.simulationDestinations.map((destination) => {
    const region = regions.find((item) => item.id === destination.congestionRegionId);
    const level = region?.currentLevel ?? 0;
    const waiting = estimateWaitingMinutesByCongestion(level);
    const regionCalls = callsForRegion(region, portCalls);
    const anchoredCount = regionCalls.filter(isAnchoredCall).length;
    const berthedCount = regionCalls.filter((call) => call.berthType && !isAnchoredCall(call)).length;

    return {
      portId: destination.id,
      portName: destination.name,
      congestionLevel: round(level),
      congestionStatus: waiting.status,
      aisShipCount: region?.currentVessels,
      inboundCount24h: region?.arrivals,
      outboundCount24h: region?.departures,
      anchoredCount,
      berthedCount,
      estimatedWaitingMinutes: waiting.waitingMinutes,
    };
  });
}

function buildTrends(regions: RegionCongestionSeries[]): CongestionAnalysisTrendPoint[] {
  return regions.flatMap((region) =>
    region.forecast.slice(0, 24).map((point) => ({
      label: `${region.name} ${kstHourLabel(point.time)}`,
      portId: BUSAN_PORT.simulationDestinations.find((destination) => destination.congestionRegionId === region.id)?.id,
      congestionLevel: round(point.level),
      inboundCount: point.arrivals ?? region.arrivals,
      outboundCount: region.departures,
      aisShipCount: point.areaVesselCount ?? region.currentVessels,
    }))
  );
}

export async function getCongestionAnalysisSnapshot(): Promise<CongestionAnalysisSnapshot> {
  const now = new Date();
  const [ships, portCalls, congestion, regions, energyResult] = await Promise.all([
    fetchShips(),
    fetchPortCalls(),
    resolveCongestion(now),
    resolveRegionalCongestion(BUSAN_PORT, now),
    getLiveEnergyDecisions(),
  ]);

  const dataSources = Array.from(
    new Set([
      congestion.source === "none" ? "no-congestion-source" : congestion.source ?? "congestion",
      "ais-supabase-ships",
      "port-mis-port-calls",
      "regional-port-congestion",
      "jit-energy-decisions",
      ...energyResult.dataSources,
    ])
  );

  return {
    generatedAt: now.toISOString(),
    ports: buildPortSnapshots(regions, portCalls),
    trends: buildTrends(regions),
    energySummary: {
      candidateCount: energyResult.summary.candidateCount,
      recommendedCount: energyResult.summary.recommendedCount,
      totalReducedWaitingMinutes: energyResult.summary.totalReducedWaitingMinutes,
      totalEstimatedCo2ReducedKg: energyResult.summary.totalEstimatedCo2ReducedKg,
    },
    forecastFreshness: {
      isStale: energyResult.forecastFreshness.isStale,
      reason: energyResult.forecastFreshness.reason,
      ...(energyResult.forecastFreshness.forecastStart ? { forecastStart: energyResult.forecastFreshness.forecastStart } : {}),
      ...(energyResult.forecastFreshness.forecastEnd ? { forecastEnd: energyResult.forecastFreshness.forecastEnd } : {}),
    },
    dataSources,
    limitations: [
      `AIS 선박 원천 ${ships.length}척, Port-MIS 현재 정박/입출항 원천 ${portCalls.length}건을 기준으로 요약했습니다.`,
      "AI는 혼잡도 숫자를 새로 계산하지 않고 백엔드 계산 결과를 해석합니다.",
      "지역별 AIS 통계 격자가 인접 항만을 완전히 분리하지 못할 수 있어 운영자 확인이 필요합니다.",
      "본 분석은 운영자 검토용이며 실제 항해 지시가 아닙니다.",
    ],
  };
}

export async function getCongestionAnalysis(): Promise<CongestionAnalysisApiResponse> {
  const snapshot = await getCongestionAnalysisSnapshot();
  const analysis: AiCongestionAnalysisResult = await generateCongestionAnalysis(snapshot);

  return {
    source: analysis.source,
    isFallback: analysis.source !== "openai",
    lastUpdated: snapshot.generatedAt,
    basis: "ai-congestion-cause-analysis",
    dataSources: snapshot.dataSources,
    snapshot,
    analysis,
    calculationNote:
      "혼잡도, 선박 수, 입출항 신고, JIT 권고 수치는 백엔드 계산 결과이며 AI가 새로 계산하지 않습니다.",
  };
}
