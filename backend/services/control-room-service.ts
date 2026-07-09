import {
  generateControlRoomAdvisor,
  type ControlRoomBriefingResult,
} from "@/backend/advisor/control-room-advisor";
import { fetchShips } from "@/backend/ais/ship-source";
import { resolveRegionalCongestion } from "@/backend/congestion/regional-congestion";
import { computeCongestionForecast } from "@/backend/prediction/congestion";
import { detectCloseQuarters, isMonitoredVessel } from "@/backend/prediction/collision-risk";
import type { EnergyDecision } from "@/backend/prediction/energy-decision";
import { fetchPortCongestion } from "@/backend/portmis/congestion-source";
import { fetchPortCalls } from "@/backend/portmis/portcall-source";
import type { CongestionForecast, PortCall, RegionCongestionSeries, Ship } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import { getLiveEnergyDecisions } from "./energy-decisions-service";

export interface ControlRoomPortSnapshot {
  id: string;
  name: string;
  congestionLevel: number;
  congestionStatus: string;
  waitingOrAnchoredCount?: number;
  arrivingCount?: number;
}

export interface ControlRoomShipSummary {
  total: number;
  underway: number;
  berthed: number;
  anchored: number;
}

export interface ControlRoomPriorityTarget {
  rank: number;
  shipName: string;
  destinationPortName?: string;
  currentSpeedKn?: number;
  recommendedSpeedKn?: number;
  priorityScore: number;
  reasonBasis: string[];
  metrics: {
    reducedWaitingMinutes: number;
    estimatedFuelSavedKg: number;
    estimatedCo2ReducedKg: number;
    currentCongestionLevel: number;
    grossTonnage?: number;
  };
  confidence?: string;
}

// 근접 충돌위험(CPA/TCPA) 경보 한 건 — 관제 안전 브리핑용.
export interface ControlRoomCollisionAlert {
  aName: string;
  bName: string;
  risk: "danger" | "warning";
  cpaNm: number; // 최근접 거리(해리)
  tcpaMinutes: number; // 최근접까지 시간(분)
  encounter: string; // 조우 형태(head-on/crossing/overtaking/indeterminate)
}

export interface ControlRoomCollisionRisk {
  totalAlerts: number;
  dangerCount: number;
  warningCount: number;
  monitoredVessels: number; // 관제 대상(대형 상선)으로 분류돼 판정에 든 선박 수
  topAlerts: ControlRoomCollisionAlert[]; // 심각도순 상위
}

export interface ControlRoomSnapshot {
  generatedAt: string;
  ports: ControlRoomPortSnapshot[];
  ships: ControlRoomShipSummary;
  collisionRisk: ControlRoomCollisionRisk;
  energy: {
    candidateCount: number;
    recommendedCount: number;
    totalReducedWaitingMinutes: number;
    totalEstimatedFuelSavedKg: number;
    totalEstimatedCo2ReducedKg: number;
    topTargets: Array<{
      shipName: string;
      destinationPortName?: string;
      currentSpeedKn?: number;
      recommendedSpeedKn?: number;
      reducedWaitingMinutes?: number;
      estimatedCo2ReducedKg?: number;
      confidence?: string;
    }>;
  };
  routeScenario?: {
    scenarioCount: number;
    recommendedRouteCount: number;
    highlights: string[];
  };
  dataSources: string[];
  limitations: string[];
}

export interface ControlRoomBriefingResponse {
  source: ControlRoomBriefingResult["source"];
  isFallback: boolean;
  lastUpdated: string;
  basis: "control-room-ai-briefing";
  dataSources: string[];
  snapshot: ControlRoomSnapshot;
  priorityTargets: ControlRoomPriorityTarget[];
  briefing: ControlRoomBriefingResult;
  calculationNote: string;
}

export type ControlRoomPriorityDecision = Pick<
  EnergyDecision,
  | "shipName"
  | "destinationPortName"
  | "currentSpeedKn"
  | "recommendedSpeedKn"
  | "reducedWaitingMinutes"
  | "estimatedFuelSavedKg"
  | "estimatedCo2ReducedKg"
  | "currentCongestionLevel"
  | "grossTonnage"
  | "confidence"
>;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function congestionStatus(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "원활";
  if (level <= medium) return "보통";
  return "혼잡";
}

function maxOrOne(values: number[]): number {
  return Math.max(1, ...values.filter((value) => Number.isFinite(value)));
}

function reasonBasis(decision: ControlRoomPriorityDecision): string[] {
  const reasons: string[] = [];
  if (decision.estimatedCo2ReducedKg > 0) reasons.push(`CO2 감축 ${Math.round(decision.estimatedCo2ReducedKg)}kg`);
  if (decision.reducedWaitingMinutes > 0) reasons.push(`대기시간 ${Math.round(decision.reducedWaitingMinutes)}분 감소`);
  if (decision.currentCongestionLevel >= BUSAN_PORT.congestionThresholds.medium) reasons.push("혼잡 시간대 진입 위험 높음");
  if ((decision.grossTonnage ?? 0) >= 50000) reasons.push(`대형 선박 GT ${Math.round(decision.grossTonnage ?? 0).toLocaleString("ko-KR")}`);
  if (reasons.length === 0) reasons.push("백엔드 JIT 계산 결과 기준 검토 대상");
  return reasons;
}

export function buildPriorityTargets(
  decisions: ControlRoomPriorityDecision[],
  limit = 5
): ControlRoomPriorityTarget[] {
  const maxCo2 = maxOrOne(decisions.map((decision) => decision.estimatedCo2ReducedKg));
  const maxWait = maxOrOne(decisions.map((decision) => decision.reducedWaitingMinutes));
  const maxGt = maxOrOne(decisions.map((decision) => decision.grossTonnage ?? 0));

  return decisions
    .map((decision) => {
      const score =
        (decision.estimatedCo2ReducedKg / maxCo2) * 0.4 +
        (decision.reducedWaitingMinutes / maxWait) * 0.3 +
        Math.min(1, Math.max(0, decision.currentCongestionLevel)) * 0.2 +
        ((decision.grossTonnage ?? 0) / maxGt) * 0.1;

      return {
        decision,
        priorityScore: round(score, 3),
      };
    })
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      if (b.decision.estimatedCo2ReducedKg !== a.decision.estimatedCo2ReducedKg) {
        return b.decision.estimatedCo2ReducedKg - a.decision.estimatedCo2ReducedKg;
      }
      if (b.decision.reducedWaitingMinutes !== a.decision.reducedWaitingMinutes) {
        return b.decision.reducedWaitingMinutes - a.decision.reducedWaitingMinutes;
      }
      if (b.decision.currentCongestionLevel !== a.decision.currentCongestionLevel) {
        return b.decision.currentCongestionLevel - a.decision.currentCongestionLevel;
      }
      return (b.decision.grossTonnage ?? 0) - (a.decision.grossTonnage ?? 0);
    })
    .slice(0, limit)
    .map(({ decision, priorityScore }, index) => ({
      rank: index + 1,
      shipName: decision.shipName,
      ...(decision.destinationPortName ? { destinationPortName: decision.destinationPortName } : {}),
      currentSpeedKn: decision.currentSpeedKn,
      recommendedSpeedKn: decision.recommendedSpeedKn,
      priorityScore,
      reasonBasis: reasonBasis(decision),
      metrics: {
        reducedWaitingMinutes: decision.reducedWaitingMinutes,
        estimatedFuelSavedKg: decision.estimatedFuelSavedKg,
        estimatedCo2ReducedKg: decision.estimatedCo2ReducedKg,
        currentCongestionLevel: decision.currentCongestionLevel,
        ...(decision.grossTonnage != null ? { grossTonnage: decision.grossTonnage } : {}),
      },
      ...(decision.confidence ? { confidence: decision.confidence } : {}),
    }));
}

const COLLISION_TOP_N = 5;

// AIS 선박 목록에서 근접 충돌위험(CPA/TCPA)을 집계한다. detectCloseQuarters가 관제 대상(대형 상선)만
// 걸러 판정하므로, 여기서는 요약 수치와 상위 경보만 뽑는다.
function buildCollisionRisk(ships: Ship[]): ControlRoomCollisionRisk {
  const t = BUSAN_PORT.collisionRisk;
  const monitoredVessels = ships.filter((ship) => isMonitoredVessel(ship, t)).length;
  const alerts = detectCloseQuarters(ships, BUSAN_PORT);

  return {
    totalAlerts: alerts.length,
    dangerCount: alerts.filter((alert) => alert.risk === "danger").length,
    warningCount: alerts.filter((alert) => alert.risk === "warning").length,
    monitoredVessels,
    topAlerts: alerts.slice(0, COLLISION_TOP_N).map((alert) => ({
      aName: alert.aName,
      bName: alert.bName,
      risk: alert.risk === "danger" ? "danger" : "warning",
      cpaNm: alert.cpaNm,
      tcpaMinutes: alert.tcpaMinutes,
      encounter: alert.encounter,
    })),
  };
}

function summarizeShips(ships: Ship[]): ControlRoomShipSummary {
  return ships.reduce<ControlRoomShipSummary>(
    (acc, ship) => ({
      total: acc.total + 1,
      underway: acc.underway + (ship.status === "underway" ? 1 : 0),
      anchored: acc.anchored + (ship.status === "anchored" ? 1 : 0),
      berthed: acc.berthed + (ship.status === "moored" ? 1 : 0),
    }),
    { total: 0, underway: 0, berthed: 0, anchored: 0 }
  );
}

function countPortCallsInRegion(region: RegionCongestionSeries | undefined, portCalls: PortCall[]): number | undefined {
  const configRegion = BUSAN_PORT.congestionRegions.find((item) => item.id === region?.id);
  if (!configRegion) return undefined;
  return portCalls.filter((call) => call.berthAreaId && configRegion.berthAreaIds.includes(call.berthAreaId)).length;
}

function buildPortSnapshots(
  congestion: CongestionForecast,
  regions: RegionCongestionSeries[],
  portCalls: PortCall[]
): ControlRoomPortSnapshot[] {
  return BUSAN_PORT.simulationDestinations.map((destination) => {
    const region = regions.find((item) => item.id === destination.congestionRegionId);
    const level = region?.currentLevel ?? congestion.currentLevel ?? 0;
    const regionPortCallCount = countPortCallsInRegion(region, portCalls);

    return {
      id: destination.id,
      name: destination.name,
      congestionLevel: round(level),
      congestionStatus: congestionStatus(level),
      waitingOrAnchoredCount: regionPortCallCount ?? region?.currentVessels,
      arrivingCount: region?.arrivals,
    };
  });
}

async function collectControlRoomData(): Promise<{
  snapshot: ControlRoomSnapshot;
  priorityTargets: ControlRoomPriorityTarget[];
}> {
  const [ships, portCalls, portMisCongestion, regionalCongestion, energyResult] = await Promise.all([
    fetchShips(),
    fetchPortCalls(),
    fetchPortCongestion(),
    resolveRegionalCongestion(BUSAN_PORT),
    getLiveEnergyDecisions(),
  ]);

  const congestion = portMisCongestion ?? computeCongestionForecast(ships, BUSAN_PORT);
  const priorityTargets = buildPriorityTargets(energyResult.decisions);
  const collisionRisk = buildCollisionRisk(ships);
  const dataSources = Array.from(
    new Set([
      "ais-supabase-ships",
      "port-mis-port-calls",
      portMisCongestion ? "port-mis-congestion" : "ais-congestion-fallback",
      "regional-port-congestion",
      "jit-energy-decisions",
      "cpa-tcpa-collision-risk",
      ...energyResult.dataSources,
    ])
  );

  const snapshot: ControlRoomSnapshot = {
    generatedAt: new Date().toISOString(),
    ports: buildPortSnapshots(congestion, regionalCongestion, portCalls),
    ships: summarizeShips(ships),
    collisionRisk,
    energy: {
      candidateCount: energyResult.summary.candidateCount,
      recommendedCount: energyResult.summary.recommendedCount,
      totalReducedWaitingMinutes: energyResult.summary.totalReducedWaitingMinutes,
      totalEstimatedFuelSavedKg: energyResult.summary.totalEstimatedFuelSavedKg,
      totalEstimatedCo2ReducedKg: energyResult.summary.totalEstimatedCo2ReducedKg,
      topTargets: priorityTargets.map((target) => ({
        shipName: target.shipName,
        ...(target.destinationPortName ? { destinationPortName: target.destinationPortName } : {}),
        currentSpeedKn: target.currentSpeedKn,
        recommendedSpeedKn: target.recommendedSpeedKn,
        reducedWaitingMinutes: target.metrics.reducedWaitingMinutes,
        estimatedCo2ReducedKg: target.metrics.estimatedCo2ReducedKg,
        ...(target.confidence ? { confidence: target.confidence } : {}),
      })),
    },
    routeScenario: {
      scenarioCount: 0,
      recommendedRouteCount: 0,
      highlights: [
        "서버에 저장된 시뮬레이션 경로 추천 결과가 없습니다.",
        "/simulation에서 계산한 경로 추천 결과는 브라우저 상태 기반으로 표시됩니다.",
      ],
    },
    dataSources,
    limitations: [
      "AI는 백엔드 계산 결과를 설명할 뿐 새로운 수치를 계산하지 않습니다.",
      "우선순위는 JIT 감속 권고 결과의 CO2 감축, 대기시간 감소, 혼잡도, 선박 규모 기준으로 백엔드에서 산정합니다.",
      "시뮬레이션 경로 추천 결과는 현재 서버에 저장하지 않아 control-room에서는 요약만 표시합니다.",
      "근접 충돌위험(CPA/TCPA)은 AIS 위치·침로·속력 기반 추정이며 관제 대상(대형 상선)만 판정합니다. 실제 회피 판단·교신은 관제사가 수행합니다.",
      "본 결과는 운영자 검토용이며 실제 항해 지시가 아닙니다.",
    ],
  };

  return { snapshot, priorityTargets };
}

export async function getControlRoomSnapshot(): Promise<ControlRoomSnapshot> {
  return (await collectControlRoomData()).snapshot;
}

export async function getControlRoomBriefing(): Promise<ControlRoomBriefingResponse> {
  const { snapshot, priorityTargets } = await collectControlRoomData();
  const briefing = await generateControlRoomAdvisor(snapshot, priorityTargets);

  return {
    source: briefing.source,
    isFallback: briefing.source !== "openai",
    lastUpdated: snapshot.generatedAt,
    basis: "control-room-ai-briefing",
    dataSources: snapshot.dataSources,
    snapshot,
    priorityTargets,
    briefing,
    calculationNote:
      "대기시간, 권고 속도, 연료 절감량, CO2 감축량, 우선순위 점수는 백엔드 계산 결과이며 AI가 새로 계산하지 않습니다.",
  };
}
