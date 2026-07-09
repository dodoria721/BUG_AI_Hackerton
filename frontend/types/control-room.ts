export type ControlRoomRiskLevel = "low" | "medium" | "high";

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

// 근접 충돌위험(CPA/TCPA) — backend/services/control-room-service.ts 와 동기화.
export interface ControlRoomCollisionAlert {
  aName: string;
  bName: string;
  risk: "danger" | "warning";
  cpaNm: number;
  tcpaMinutes: number;
  encounter: string;
}

export interface ControlRoomCollisionRisk {
  totalAlerts: number;
  dangerCount: number;
  warningCount: number;
  monitoredVessels: number;
  topAlerts: ControlRoomCollisionAlert[];
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

export interface ControlRoomBriefingPriorityVessel {
  rank: number;
  shipName: string;
  reason: string;
  expectedImpact: string;
}

export interface ControlRoomBriefingResult {
  source: "openai" | "rule-based-fallback";
  riskLevel: ControlRoomRiskLevel;
  headline: string;
  summary: string;
  congestionCauses: string[];
  priorityActions: string[];
  priorityVessels: ControlRoomBriefingPriorityVessel[];
  routeScenarioSummary?: string;
  risks: string[];
  nextSteps: string[];
  disclaimer: string;
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
