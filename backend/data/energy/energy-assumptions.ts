import type {
  CongestionWaitingEstimate,
  CongestionWaitingStatus,
  Confidence,
  NormalizedVesselType,
  ShipSizeClass,
  WaitingFuelRate,
} from "./types";

export const WAITING_FUEL_KG_PER_HOUR_BY_SIZE: Record<ShipSizeClass, number> = {
  small: 40,
  medium: 90,
  large: 180,
  veryLarge: 300,
  unknown: 80,
};

export const SHIP_TYPE_FUEL_MULTIPLIER: Record<NormalizedVesselType, number> = {
  container: 1.2,
  bulk: 1.0,
  tanker: 1.1,
  lng: 1.05,
  reefer: 1.15,
  cruise: 1.3,
  generalCargo: 1.0,
  unknown: 1.0,
};

export const CONGESTION_WAITING_MINUTES: Array<{
  minRawLevel: number;
  maxRawLevelExclusive: number | null;
  status: CongestionWaitingStatus;
  waitingMinutes: number;
}> = [
  { minRawLevel: 0, maxRawLevelExclusive: 0.3, status: "원활", waitingMinutes: 5 },
  { minRawLevel: 0.3, maxRawLevelExclusive: 0.6, status: "보통", waitingMinutes: 15 },
  { minRawLevel: 0.6, maxRawLevelExclusive: 0.85, status: "주의", waitingMinutes: 35 },
  { minRawLevel: 0.85, maxRawLevelExclusive: 1, status: "혼잡", waitingMinutes: 60 },
  { minRawLevel: 1, maxRawLevelExclusive: null, status: "포화", waitingMinutes: 90 },
];

export const JIT_SPEED_ADVISORY_CONSTRAINTS = {
  candidateStatus: "underway",
  minSogKn: 3,
  minDistanceNm: 10,
  maxDistanceNm: 600,
  recommendationWindowHours: 6,
  minRecommendedSpeedKn: 8,
  onlyRecommendWhenRecommendedSpeedLowerThanCurrent: true,
} as const;

export const ENERGY_ESTIMATE_DISCLAIMER =
  "연료 절감량과 CO2 감축량은 선박 크기, 속도, 혼잡도 기반 추정값입니다. 실제 운항 및 항만 관제 판단은 운영자가 최종 결정해야 합니다.";

export function classifyShipSize(grossTonnage?: number): ShipSizeClass {
  if (grossTonnage == null || !Number.isFinite(grossTonnage) || grossTonnage < 0) return "unknown";
  if (grossTonnage < 5000) return "small";
  if (grossTonnage < 30000) return "medium";
  if (grossTonnage < 80000) return "large";
  return "veryLarge";
}

export function normalizeVesselType(vesselType?: string): NormalizedVesselType {
  const value = (vesselType ?? "").trim().toLowerCase();
  if (!value) return "unknown";
  if (/(컨테이너|container)/i.test(value)) return "container";
  if (/(산적|벌크|bulk)/i.test(value)) return "bulk";
  if (/(유조|탱커|제품|케미컬|tanker)/i.test(value)) return "tanker";
  if (/lng/i.test(value)) return "lng";
  if (/(냉동|냉장|reefer)/i.test(value)) return "reefer";
  if (/(크루즈|여객|cruise|passenger)/i.test(value)) return "cruise";
  if (/(화물|cargo|general)/i.test(value)) return "generalCargo";
  return "unknown";
}

function confidenceFor(sizeClass: ShipSizeClass, normalizedVesselType: NormalizedVesselType): Confidence {
  if (sizeClass === "unknown" && normalizedVesselType === "unknown") return "low";
  if (sizeClass === "unknown" || normalizedVesselType === "unknown") return "medium";
  return "high";
}

export function getWaitingFuelKgPerHour(params: { grossTonnage?: number; vesselType?: string }): WaitingFuelRate {
  const sizeClass = classifyShipSize(params.grossTonnage);
  const normalizedVesselType = normalizeVesselType(params.vesselType);
  const baseKgPerHour = WAITING_FUEL_KG_PER_HOUR_BY_SIZE[sizeClass];
  const multiplier = SHIP_TYPE_FUEL_MULTIPLIER[normalizedVesselType];

  return {
    sizeClass,
    normalizedVesselType,
    baseKgPerHour,
    multiplier,
    kgPerHour: Math.round(baseKgPerHour * multiplier),
    confidence: confidenceFor(sizeClass, normalizedVesselType),
  };
}

export function estimateWaitingMinutesByCongestion(rawLevel: number): CongestionWaitingEstimate {
  const level = Number.isFinite(rawLevel) ? rawLevel : 0;
  const matched = CONGESTION_WAITING_MINUTES.find(
    (rule) => level >= rule.minRawLevel && (rule.maxRawLevelExclusive == null || level < rule.maxRawLevelExclusive)
  );
  return matched
    ? { waitingMinutes: matched.waitingMinutes, status: matched.status }
    : { waitingMinutes: 5, status: "원활" };
}
