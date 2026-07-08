import type { ScenarioShipSource } from "@/frontend/types/simulation";

export interface RoutePolylinePoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface RoutePolyline {
  routeId: string;
  routeName: string;
  points: RoutePolylinePoint[];
}

export interface RouteScenarioMapOverlay {
  shipId: string;
  routeId: string;
  routeName: string;
  isRecommended: boolean;
  points: RoutePolylinePoint[];
  distanceNm?: number;
  eta?: string;
  score?: number;
}

export interface RouteScenarioAdvisorResult {
  source: "openai" | "rule-based-fallback";
  summary: string;
  recommendation: string;
  comparison: string[];
  reasons: string[];
  risks: string[];
  disclaimer: string;
}

export interface RouteScenario {
  routeId: string;
  routeName: string;
  routeShortName: string;
  routeSource: "manual-simulation-route";
  destinationPortId: string;
  destinationPortName: string;
  distanceNm: number;
  currentSpeedKn: number;
  eta: string;
  congestionLevel: number;
  congestionStatus: string;
  congestionBasis: string;
  estimatedWaitingMinutes: number;
  recommendedSpeedKn: number;
  recommendedEta: string;
  reducedWaitingMinutes: number;
  estimatedFuelKg: number;
  estimatedCo2Kg: number;
  estimatedFuelSavedKg: number;
  estimatedCo2ReducedKg: number;
  score: number;
  rank: number;
  isRecommended: boolean;
  reasons: string[];
  calculationBasis: string[];
  warnings: string[];
  routePolyline: RoutePolyline;
}

export interface RouteScenarioShipResult {
  shipId?: string;
  shipName: string;
  scenarioSource?: ScenarioShipSource;
  originalShipId?: string;
  mmsi?: string;
  imo?: string;
  callSign?: string;
  snapshotAt?: string;
  destinationPortId: string;
  destinationPortName: string;
  recommendedRouteId?: string;
  recommendedRouteName?: string;
  recommendedRouteShortName?: string;
  advisor?: RouteScenarioAdvisorResult;
  routeScenarios: RouteScenario[];
  warnings: string[];
}

export interface RouteScenarioResponse {
  source: "deterministic-route-scenario";
  advisorSource?: RouteScenarioAdvisorResult["source"];
  mode: "simulation";
  basis: "predefined-approach-route-comparison";
  lastUpdated: string;
  calculationNote: string;
  isFallback: boolean;
  dataSources?: string[];
  results: RouteScenarioShipResult[];
  summary: {
    shipCount: number;
    recommendedCount: number;
  };
  validation?: {
    acceptedCount: number;
    rejectedCount: number;
    issues?: Array<{ index: number | "simulatedShips"; message: string }>;
  };
  invalidShips?: Array<{ index: number | "simulatedShips"; message: string }>;
}
