import type { ShipStatus } from "@/frontend/types/domain";

export type FuelType = "MGO" | "VLSFO" | "LNG";
export type CiiGrade = "A" | "B" | "C" | "D" | "E";

export interface VesselView {
  type: string | null;
  callSign: string | null;
  mmsi: string | null;
  imo: string | null;
  nationality: string | null;
  grossTonnage: number | null;
  fromPort: string | null;
  toPort: string | null;
  arrivalTimeIso: string | null;
  status: ShipStatus;
  speedKn: number | null;
  position: { lat: number; lon: number } | null;
  etaIso: string | null;
  remainingHours: number | null;
  berthName: string | null;
  fuelType: FuelType;
  fuelRateTonPerHour: number;
  dfocEstTonPerDay: number;
}

export interface CiiStatus {
  year: number;
  dwtEstimate: number;
  referenceCii: number;
  requiredCii: number;
  attainedCii: number;
  grade: CiiGrade;
  boundaries: [number, number, number, number];
  marginPct: number;
}

export interface ApproachCiiCurvePoint {
  speed: number;
  cii: number;
  fuelTon: number;
  co2Ton: number;
  travelHours: number;
}

export interface ApproachCiiCurve {
  basis: "ais-position-to-port-approach";
  distanceNm: number;
  capacityTonnage: number;
  capacitySource: "vessel-spec-dwt" | "gt-estimate";
  fuelType: FuelType;
  selectedSpeedKn: number;
  selectedCii: number;
  points: ApproachCiiCurvePoint[];
  note: string;
}

export interface FuelBreakdown {
  totalTon: number;
}

export interface SpeedAdvisory {
  waitHoursIfFullSpeed: number;
  recommendedSpeedKn: number;
  etaDelayHours: number;
  baseline: FuelBreakdown;
  jit: FuelBreakdown;
  savings: {
    fuelTon: number;
    co2Ton: number;
    fuelCostUsd: number;
  };
}

export interface VesselMonitorItem {
  id?: string;
  label: string;
  hasMatchedShip: boolean;
  view: VesselView;
  cii: CiiStatus | null;
  approachCiiCurve: ApproachCiiCurve | null;
  advisory: SpeedAdvisory | null;
}

export interface VesselMonitorData {
  congestion: { currentLevel: number };
  items: VesselMonitorItem[];
}
