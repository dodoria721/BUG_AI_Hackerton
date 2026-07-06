import type { CongestionForecast, CongestionPoint, PortCall, PortConfig, ShipStatus } from "../ports/port-types";
import { BUSAN_PORT } from "../ports/seed-port";
import { haversineDistanceKm } from "./eta";
import {
  ENERGY_ESTIMATE_DISCLAIMER,
  estimateWaitingMinutesByCongestion,
  findVesselSpecByImo,
  findVesselSpecByMmsi,
  findVesselSpecByName,
  getFuelEmissionFactor,
  getWaitingFuelKgPerHour,
  inferFuelType,
  normalizeShipName,
  normalizeVesselType,
  type Confidence,
  type CongestionWaitingStatus,
  type NormalizedVesselType,
  type ShipSizeClass,
} from "../data/energy";

const KM_TO_NM = 1 / 1.852;
const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_MIN_SPEED_KN = 8;
const MIN_SOG_KN = 3;
const MIN_DISTANCE_NM = 10;
const SIMULATION_MIN_DISTANCE_NM = 1;
const MAX_DISTANCE_NM = 600;

export type CongestionBasis = "eta-forecast-bucket" | "current-level-fallback" | "dashboard-current-level";
export type CurrentInPortBasis = "actual-port-calls" | "level-times-p99" | "unknown";
export type EnergyDecisionCongestionMode = "dashboard-current" | "eta-forecast";

export interface EnergyDecisionShipInput {
  id?: string;
  mmsi?: string;
  name: string;
  lat: number;
  lon: number;
  sog: number;
  cog?: number;
  eta?: string;
  status: ShipStatus;
  callSign?: string;
  imo?: string;
  grossTonnage?: number;
  vesselType?: string;
  source?: "simulation";
  isSimulated?: boolean;
}

export interface ComputeEnergyDecisionsInput {
  ships: EnergyDecisionShipInput[];
  congestion: CongestionForecast;
  portCalls?: PortCall[];
  portConfig?: PortConfig;
  now?: Date;
  mode?: "simulation";
  congestionMode?: EnergyDecisionCongestionMode;
}

export interface EnergyDecision {
  shipId?: string;
  shipName: string;
  callSign?: string;
  mmsi?: string;
  imo?: string;
  source?: "simulation";
  isSimulated?: boolean;

  status: "underway";
  distanceNm: number;
  currentSpeedKn: number;
  recommendedSpeedKn: number;
  idealJitSpeedKn: number;
  minSpeedApplied: boolean;

  currentEta: string;
  recommendedEta: string;

  currentCongestionLevel: number;
  currentCongestionStatus: CongestionWaitingStatus;
  recommendedCongestionLevel: number;
  recommendedCongestionStatus: CongestionWaitingStatus;
  congestionBasis: CongestionBasis;

  currentWaitingMinutes: number;
  optimizedWaitingMinutes: number;
  reducedWaitingMinutes: number;
  absorbedWaitMinutes: number;
  residualWaitMinutes: number;

  grossTonnage?: number;
  vesselType?: string;
  normalizedVesselType: NormalizedVesselType;
  sizeClass: ShipSizeClass;

  fuelType: string;
  fuelNameKo: string;
  fuelTypeInferred: boolean;
  fuelTypeReason: string;
  fuelConsumptionKgPerHour: number;
  estimatedFuelSavedKg: number;
  co2Factor: number;
  estimatedCo2ReducedKg: number;

  currentInPort?: number;
  currentInPortBasis: CurrentInPortBasis;

  confidence: Confidence;
  reasons: string[];
  calculationBasis: string[];
}

export interface EnergyDecisionSummary {
  candidateCount: number;
  recommendedCount: number;
  etaForecastMatchedCount: number;
  currentLevelFallbackCount: number;
  lowCongestionSkippedCount: number;
  noWaitSkippedCount: number;
  minSpeedSkippedCount: number;
  speedNotReducedSkippedCount: number;
  totalReducedWaitingMinutes: number;
  totalEstimatedFuelSavedKg: number;
  totalEstimatedCo2ReducedKg: number;
}

export interface ForecastFreshness {
  isStale: boolean;
  forecastStart?: string;
  forecastEnd?: string;
  now: string;
  matchedEtaBucketCount: number;
  fallbackCount: number;
  reason: string;
}

export type EmptyReasonCode =
  | "NO_UNDERWAY_CANDIDATES"
  | "STALE_FORECAST_LOW_FALLBACK_CONGESTION"
  | "LOW_CONGESTION_OR_NO_WAIT"
  | "NO_EFFECTIVE_SPEED_REDUCTION"
  | "SIMULATION_DASHBOARD_CURRENT_NO_RECOMMENDATION";

export interface EmptyReason {
  code: EmptyReasonCode;
  title: string;
  description: string;
  suggestions: string[];
}

export interface EnergyDecisionResult {
  source: "deterministic-jit";
  mode?: "simulation";
  congestionMode?: EnergyDecisionCongestionMode;
  isFallback: boolean;
  basis:
    | "jit-arrival-energy-decision"
    | "jit-arrival-simulation"
    | "jit-arrival-simulation-dashboard-current-congestion";
  lastUpdated: string;
  dataSources: string[];
  dashboardCongestion?: {
    level: number;
    status: CongestionWaitingStatus;
    source?: string;
    basis?: string;
  };
  forecastFreshness: ForecastFreshness;
  decisions: EnergyDecision[];
  summary: EnergyDecisionSummary;
  emptyReason?: EmptyReason;
  calculationNote: string;
}

interface EnrichedShip {
  vesselType?: string;
  grossTonnage?: number;
  imo?: string;
  callSign?: string;
  sizeClass: ShipSizeClass;
  normalizedVesselType: NormalizedVesselType;
  matchBasis: string;
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * MS_PER_HOUR);
}

function bucketStart(date: Date): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function findForecastBucket(forecast: CongestionPoint[], eta: Date): CongestionPoint | undefined {
  const etaTime = eta.getTime();
  return forecast.find((point) => {
    const start = new Date(point.time).getTime();
    return etaTime >= start && etaTime < start + MS_PER_HOUR;
  });
}

function forecastWindow(forecast: CongestionPoint[]): { forecastStart?: string; forecastEnd?: string } {
  const validTimes = forecast
    .map((point) => new Date(point.time).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  if (validTimes.length === 0) return {};
  return {
    forecastStart: new Date(validTimes[0]).toISOString(),
    forecastEnd: new Date(validTimes[validTimes.length - 1]).toISOString(),
  };
}

function buildForecastFreshness(params: {
  forecast: CongestionPoint[];
  now: Date;
  matchedEtaBucketCount: number;
  fallbackCount: number;
}): ForecastFreshness {
  const { forecastStart, forecastEnd } = forecastWindow(params.forecast);
  const forecastEndMs = forecastEnd ? new Date(forecastEnd).getTime() : Number.NaN;
  const hasForecast = Boolean(forecastStart && forecastEnd);
  const isPastForecast = hasForecast && Number.isFinite(forecastEndMs) && forecastEndMs < params.now.getTime();
  const noEtaMatches = params.matchedEtaBucketCount === 0 && params.fallbackCount > 0;
  const isStale = !hasForecast || isPastForecast || noEtaMatches;

  let reason = "선박 ETA가 congestion forecast 범위 안에 있어 ETA 시간대 기준으로 계산했습니다.";
  if (!hasForecast) {
    reason = "congestion forecast가 없어 currentLevel fallback을 사용했습니다.";
  } else if (isPastForecast) {
    reason = "congestion forecast가 현재 시각보다 과거 범위라 선박 ETA에 대해 currentLevel fallback을 사용했습니다.";
  } else if (noEtaMatches) {
    reason = "선박 ETA가 congestion forecast 범위 밖에 있어 currentLevel fallback을 사용했습니다.";
  }

  return {
    isStale,
    ...(forecastStart ? { forecastStart } : {}),
    ...(forecastEnd ? { forecastEnd } : {}),
    now: params.now.toISOString(),
    matchedEtaBucketCount: params.matchedEtaBucketCount,
    fallbackCount: params.fallbackCount,
    reason,
  };
}

function levelStatus(level: number): CongestionWaitingStatus {
  return estimateWaitingMinutesByCongestion(level).status;
}

function findPortCall(ship: EnergyDecisionShipInput, portCalls: PortCall[]): PortCall | undefined {
  const shipCallSign = ship.callSign?.trim().toUpperCase();
  if (shipCallSign) {
    const byCallSign = portCalls.find((call) => call.callSign?.trim().toUpperCase() === shipCallSign);
    if (byCallSign) return byCallSign;
  }

  const shipName = normalizeShipName(ship.name);
  if (!shipName) return undefined;
  return portCalls.find((call) => normalizeShipName(call.vesselName) === shipName);
}

function isSimulatedShip(ship: EnergyDecisionShipInput): boolean {
  return ship.source === "simulation" || ship.isSimulated === true;
}

function enrichShip(ship: EnergyDecisionShipInput, portCalls: PortCall[]): EnrichedShip {
  if (isSimulatedShip(ship)) {
    const vesselType = ship.vesselType;
    const grossTonnage = ship.grossTonnage;
    const normalizedVesselType = normalizeVesselType(vesselType);
    const waitingFuel = getWaitingFuelKgPerHour({ grossTonnage, vesselType });

    return {
      ...(vesselType ? { vesselType } : {}),
      ...(grossTonnage != null ? { grossTonnage } : {}),
      ...(ship.imo ? { imo: ship.imo } : {}),
      ...(ship.callSign ? { callSign: ship.callSign } : {}),
      sizeClass: waitingFuel.sizeClass,
      normalizedVesselType,
      matchBasis: "simulation-input",
    };
  }

  const spec =
    findVesselSpecByMmsi(ship.mmsi) ??
    findVesselSpecByImo(ship.imo) ??
    findVesselSpecByName(ship.name);
  const portCall = findPortCall(ship, portCalls);
  const vesselType = portCall?.vesselType ?? spec?.vesselType;
  const grossTonnage = ship.grossTonnage ?? portCall?.grossTonnage ?? spec?.grossTonnage;
  const normalizedVesselType = normalizeVesselType(vesselType);
  const waitingFuel = getWaitingFuelKgPerHour({ grossTonnage, vesselType });

  let matchBasis = "ais-only";
  if (spec?.mmsi && spec.mmsi === ship.mmsi) matchBasis = "mmsi";
  else if (ship.imo && spec?.imo === ship.imo) matchBasis = "imo";
  else if (portCall?.callSign && ship.callSign && portCall.callSign.trim().toUpperCase() === ship.callSign.trim().toUpperCase()) {
    matchBasis = "call-sign";
  } else if (spec || portCall) {
    matchBasis = "ship-name";
  }

  return {
    ...(vesselType ? { vesselType } : {}),
    ...(grossTonnage != null ? { grossTonnage } : {}),
    ...(ship.imo ?? spec?.imo ? { imo: ship.imo ?? spec?.imo } : {}),
    ...(ship.callSign ?? portCall?.callSign ? { callSign: ship.callSign ?? portCall?.callSign } : {}),
    sizeClass: waitingFuel.sizeClass,
    normalizedVesselType,
    matchBasis,
  };
}

function currentInPort(
  congestion: CongestionForecast,
  portCalls: PortCall[],
  portConfig: PortConfig
): { count?: number; basis: CurrentInPortBasis } {
  if (portCalls.length > 0) return { count: portCalls.length, basis: "actual-port-calls" };
  if (Number.isFinite(congestion.currentLevel)) {
    return {
      count: Math.round(Math.max(0, congestion.currentLevel) * portConfig.portCallCapacity.portWide.p99),
      basis: "level-times-p99",
    };
  }
  return { basis: "unknown" };
}

function confidence(params: {
  congestionBasis: CongestionBasis;
  grossTonnage?: number;
  vesselType?: string;
  fuelConfidence: Confidence;
  currentInPortBasis: CurrentInPortBasis;
}): Confidence {
  let score = 0;
  if (params.congestionBasis === "eta-forecast-bucket" || params.congestionBasis === "dashboard-current-level") score += 2;
  if (params.grossTonnage != null) score += 1;
  if (params.vesselType) score += 1;
  if (params.fuelConfidence === "high") score += 2;
  else if (params.fuelConfidence === "medium") score += 1;
  if (params.currentInPortBasis === "actual-port-calls") score += 1;

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function buildEmptyReason(
  summary: EnergyDecisionSummary,
  freshness: ForecastFreshness,
  context?: { simulationDashboardCurrent?: boolean; currentLevel?: number }
): EmptyReason | undefined {
  if (summary.recommendedCount > 0) return undefined;

  if (summary.candidateCount === 0) {
    return {
      code: "NO_UNDERWAY_CANDIDATES",
      title: "현재 JIT 감속 권고 대상 선박이 없습니다.",
      description: "접근 중인 선박이 없거나 속도·거리 조건을 만족하는 선박이 없습니다.",
      suggestions: [
        "AIS 선박 위치와 속도 데이터가 최신인지 확인하세요.",
        "부산항 중심 기준 10~600해리 범위의 항해 중 선박이 있는지 확인하세요.",
      ],
    };
  }

  if (context?.simulationDashboardCurrent) {
    const levelText = context.currentLevel != null ? `${Math.round(context.currentLevel * 100)}%` : "현재";
    return {
      code: "SIMULATION_DASHBOARD_CURRENT_NO_RECOMMENDATION",
      title: "현재 생성된 가상 선박 기준으로 JIT 감속 권고가 없습니다.",
      description: `현재 대시보드 혼잡도 ${levelText} 기준으로는 해당 가상 선박의 감속 권고 효과가 크지 않습니다.`,
      suggestions: [
        "현재 혼잡도가 낮으면 감속 권고가 표시되지 않을 수 있습니다.",
        "가상 선박 속도가 이미 낮거나 부산항과 너무 가까우면 감속 효과가 제한적일 수 있습니다.",
        "계산된 권고 속도가 현재 속도보다 낮지 않으면 권고에서 제외됩니다.",
      ],
    };
  }

  if (freshness.isStale && summary.currentLevelFallbackCount > 0) {
    return {
      code: "STALE_FORECAST_LOW_FALLBACK_CONGESTION",
      title: "현재 JIT 감속 권고 대상 선박이 없습니다.",
      description:
        "혼잡도 forecast가 현재 선박 ETA 범위와 맞지 않아 currentLevel fallback으로 계산했습니다. 현재 fallback 혼잡도가 낮아 감속 권고가 생성되지 않았습니다.",
      suggestions: [
        "Port-MIS enrichment를 최신화한 뒤 다시 확인하세요.",
        "혼잡도 forecast가 선박 ETA 시간대를 포함하는지 확인하세요.",
        "현재 또는 ETA 시간대 혼잡도가 낮으면 감속 권고가 표시되지 않을 수 있습니다.",
      ],
    };
  }

  if (summary.lowCongestionSkippedCount > 0 || summary.noWaitSkippedCount > 0) {
    return {
      code: "LOW_CONGESTION_OR_NO_WAIT",
      title: "현재 JIT 감속 권고 대상 선박이 없습니다.",
      description: "선박 ETA 시간대의 혼잡도가 낮거나 예상 대기시간이 작아 감속 권고가 생성되지 않았습니다.",
      suggestions: [
        "혼잡도 forecast의 피크 시간대와 선박 ETA가 겹치는지 확인하세요.",
        "Port-MIS 데이터 최신화 후 다시 확인하세요.",
      ],
    };
  }

  return {
    code: "NO_EFFECTIVE_SPEED_REDUCTION",
    title: "현재 JIT 감속 권고 대상 선박이 없습니다.",
    description: "계산된 권고 속도가 현재 속도보다 낮지 않아 감속 권고로 표시하지 않았습니다.",
    suggestions: [
      "선박의 현재 속도와 부산항까지의 거리를 확인하세요.",
      "혼잡도가 높아져 실제 대기시간을 항해시간으로 흡수할 수 있을 때 권고가 표시됩니다.",
    ],
  };
}

export function computeEnergyDecisions(input: ComputeEnergyDecisionsInput): EnergyDecisionResult {
  const portConfig = input.portConfig ?? BUSAN_PORT;
  const now = input.now ?? new Date();
  const portCalls = input.portCalls ?? [];
  const simulationMode = input.mode === "simulation";
  const congestionMode: EnergyDecisionCongestionMode = input.congestionMode ?? (simulationMode ? "dashboard-current" : "eta-forecast");
  const useDashboardCurrent = simulationMode && congestionMode === "dashboard-current";
  const inPort = currentInPort(input.congestion, portCalls, portConfig);
  const decisions: EnergyDecision[] = [];
  let candidateCount = 0;
  let etaForecastMatchedCount = 0;
  let currentLevelFallbackCount = 0;
  let lowCongestionSkippedCount = 0;
  let noWaitSkippedCount = 0;
  let minSpeedSkippedCount = 0;
  let speedNotReducedSkippedCount = 0;

  for (const ship of input.ships) {
    if (ship.status !== "underway" || ship.sog < MIN_SOG_KN) continue;

    const distanceNm = haversineDistanceKm({ lat: ship.lat, lon: ship.lon }, portConfig.center) * KM_TO_NM;
    const simulated = isSimulatedShip(ship) || simulationMode;
    const minDistanceNm = simulated ? SIMULATION_MIN_DISTANCE_NM : MIN_DISTANCE_NM;
    if (distanceNm < minDistanceNm || distanceNm > MAX_DISTANCE_NM) continue;
    candidateCount += 1;

    const currentSpeedKn = Math.max(0.1, ship.sog);
    const currentTravelHours = distanceNm / currentSpeedKn;
    const currentEtaDate = addHours(now, currentTravelHours);
    const currentBucket = useDashboardCurrent ? undefined : findForecastBucket(input.congestion.forecast, currentEtaDate);
    const congestionBasis: CongestionBasis = useDashboardCurrent
      ? "dashboard-current-level"
      : currentBucket
        ? "eta-forecast-bucket"
        : "current-level-fallback";
    if (currentBucket) etaForecastMatchedCount += 1;
    else if (!useDashboardCurrent) currentLevelFallbackCount += 1;
    const currentCongestionLevel = useDashboardCurrent ? input.congestion.currentLevel ?? 0 : currentBucket?.level ?? input.congestion.currentLevel ?? 0;
    const currentWait = estimateWaitingMinutesByCongestion(currentCongestionLevel);

    if (currentWait.status === "원활") {
      lowCongestionSkippedCount += 1;
      noWaitSkippedCount += 1;
      continue;
    }
    if (currentWait.waitingMinutes <= 0) {
      noWaitSkippedCount += 1;
      continue;
    }

    const waitHours = currentWait.waitingMinutes / 60;
    const idealJitSpeedKn = distanceNm / (currentTravelHours + waitHours);
    const minSpeedApplied = idealJitSpeedKn < DEFAULT_MIN_SPEED_KN;
    const recommendedSpeedKn = Math.min(currentSpeedKn, Math.max(DEFAULT_MIN_SPEED_KN, idealJitSpeedKn));
    if (recommendedSpeedKn >= currentSpeedKn) {
      speedNotReducedSkippedCount += 1;
      continue;
    }

    const recommendedTravelHours = distanceNm / recommendedSpeedKn;
    const absorbedWaitMinutes = Math.min(currentWait.waitingMinutes, Math.max(0, (recommendedTravelHours - currentTravelHours) * 60));
    const residualWaitMinutes = Math.max(0, currentWait.waitingMinutes - absorbedWaitMinutes);
    const reducedWaitingMinutes = Math.max(0, currentWait.waitingMinutes - residualWaitMinutes);
    if (reducedWaitingMinutes <= 0) {
      if (minSpeedApplied) minSpeedSkippedCount += 1;
      continue;
    }

    const recommendedEtaDate = addHours(now, recommendedTravelHours);
    const recommendedBucket = useDashboardCurrent ? undefined : findForecastBucket(input.congestion.forecast, recommendedEtaDate);
    const recommendedCongestionLevel = useDashboardCurrent ? currentCongestionLevel : recommendedBucket?.level ?? currentCongestionLevel;
    const recommendedCongestionStatus = levelStatus(recommendedCongestionLevel);

    const enriched = enrichShip(ship, portCalls);
    const waitingFuel = getWaitingFuelKgPerHour({
      grossTonnage: enriched.grossTonnage,
      vesselType: enriched.vesselType,
    });
    const fuelInference = inferFuelType({
      vesselType: enriched.vesselType,
      grossTonnage: enriched.grossTonnage,
    });
    const fuelFactor = getFuelEmissionFactor(fuelInference.fuelType);
    const estimatedFuelSavedKg = (reducedWaitingMinutes / 60) * waitingFuel.kgPerHour;
    const estimatedCo2ReducedKg = estimatedFuelSavedKg * fuelFactor.cfTco2PerTon;
    if (estimatedFuelSavedKg <= 0 || estimatedCo2ReducedKg <= 0) continue;

    const reasons = [
      congestionBasis === "dashboard-current-level"
        ? `대시보드 현재 Port-MIS 혼잡도 ${round(currentCongestionLevel, 2)} 사용`
        : congestionBasis === "eta-forecast-bucket"
        ? `ETA 시간대 forecast bucket(${bucketStart(currentEtaDate)}) 혼잡도 ${round(currentCongestionLevel, 2)} 사용`
        : `ETA 시간대 forecast bucket 없음, currentLevel ${round(currentCongestionLevel, 2)} 사용`,
      `JIT 속도 ${round(recommendedSpeedKn, 1)}kn로 ${Math.round(reducedWaitingMinutes)}분 대기 흡수`,
      isSimulatedShip(ship) ? "가상 선박 입력값 기준으로 선종·총톤수 사용" : `선박 제원 매칭 기준: ${enriched.matchBasis}`,
      fuelInference.reason,
    ];
    if (simulated && distanceNm < MIN_DISTANCE_NM) {
      reasons.push("부산항과 가까운 위치라 JIT 감속 효과가 제한적일 수 있습니다.");
    }

    const calculationBasis = [
      "JIT 정시도착: v = distanceNm / (distanceNm / currentSpeedKn + waitingHours)",
      useDashboardCurrent
        ? "dashboard current Port-MIS congestion level"
        : "ETA가 포함된 Port-MIS congestion forecast bucket 우선 사용",
      "대기 연료 소모율: backend/data/energy getWaitingFuelKgPerHour()",
      "CO2 감축량 kg = 절감 연료 kg * cfTco2PerTon",
    ];

    const shipId = isSimulatedShip(ship) ? ship.id ?? ship.mmsi : ship.mmsi;

    decisions.push({
      ...(shipId ? { shipId } : {}),
      shipName: ship.name,
      ...(enriched.callSign ? { callSign: enriched.callSign } : {}),
      ...(ship.mmsi ? { mmsi: ship.mmsi } : {}),
      ...(enriched.imo ? { imo: enriched.imo } : {}),
      ...(isSimulatedShip(ship) ? { source: "simulation", isSimulated: true } : {}),
      status: "underway",
      distanceNm: round(distanceNm, 1),
      currentSpeedKn: round(currentSpeedKn, 1),
      recommendedSpeedKn: round(recommendedSpeedKn, 1),
      idealJitSpeedKn: round(idealJitSpeedKn, 1),
      minSpeedApplied,
      currentEta: currentEtaDate.toISOString(),
      recommendedEta: recommendedEtaDate.toISOString(),
      currentCongestionLevel: round(currentCongestionLevel, 3),
      currentCongestionStatus: currentWait.status,
      recommendedCongestionLevel: round(recommendedCongestionLevel, 3),
      recommendedCongestionStatus,
      congestionBasis,
      currentWaitingMinutes: Math.round(currentWait.waitingMinutes),
      optimizedWaitingMinutes: Math.round(residualWaitMinutes),
      reducedWaitingMinutes: Math.round(reducedWaitingMinutes),
      absorbedWaitMinutes: Math.round(absorbedWaitMinutes),
      residualWaitMinutes: Math.round(residualWaitMinutes),
      ...(enriched.grossTonnage != null ? { grossTonnage: enriched.grossTonnage } : {}),
      ...(enriched.vesselType ? { vesselType: enriched.vesselType } : {}),
      normalizedVesselType: enriched.normalizedVesselType,
      sizeClass: enriched.sizeClass,
      fuelType: fuelFactor.fuelType,
      fuelNameKo: fuelFactor.fuelNameKo,
      fuelTypeInferred: true,
      fuelTypeReason: fuelInference.reason,
      fuelConsumptionKgPerHour: Math.round(waitingFuel.kgPerHour),
      estimatedFuelSavedKg: Math.round(estimatedFuelSavedKg),
      co2Factor: fuelFactor.cfTco2PerTon,
      estimatedCo2ReducedKg: Math.round(estimatedCo2ReducedKg),
      ...(inPort.count != null ? { currentInPort: inPort.count } : {}),
      currentInPortBasis: inPort.basis,
      confidence: confidence({
        congestionBasis,
        grossTonnage: enriched.grossTonnage,
        vesselType: enriched.vesselType,
        fuelConfidence: fuelInference.confidence,
        currentInPortBasis: inPort.basis,
      }),
      reasons,
      calculationBasis,
    });
  }

  decisions.sort((a, b) => b.estimatedCo2ReducedKg - a.estimatedCo2ReducedKg);

  const summary = decisions.reduce<EnergyDecisionSummary>(
    (acc, decision) => ({
      candidateCount: acc.candidateCount,
      recommendedCount: acc.recommendedCount + 1,
      etaForecastMatchedCount: acc.etaForecastMatchedCount,
      currentLevelFallbackCount: acc.currentLevelFallbackCount,
      lowCongestionSkippedCount: acc.lowCongestionSkippedCount,
      noWaitSkippedCount: acc.noWaitSkippedCount,
      minSpeedSkippedCount: acc.minSpeedSkippedCount,
      speedNotReducedSkippedCount: acc.speedNotReducedSkippedCount,
      totalReducedWaitingMinutes: acc.totalReducedWaitingMinutes + decision.reducedWaitingMinutes,
      totalEstimatedFuelSavedKg: acc.totalEstimatedFuelSavedKg + decision.estimatedFuelSavedKg,
      totalEstimatedCo2ReducedKg: acc.totalEstimatedCo2ReducedKg + decision.estimatedCo2ReducedKg,
    }),
    {
      candidateCount,
      recommendedCount: 0,
      etaForecastMatchedCount,
      currentLevelFallbackCount,
      lowCongestionSkippedCount,
      noWaitSkippedCount,
      minSpeedSkippedCount,
      speedNotReducedSkippedCount,
      totalReducedWaitingMinutes: 0,
      totalEstimatedFuelSavedKg: 0,
      totalEstimatedCo2ReducedKg: 0,
    }
  );
  const forecastFreshness: ForecastFreshness = useDashboardCurrent
    ? {
        ...forecastWindow(input.congestion.forecast),
        isStale: false,
        now: now.toISOString(),
        matchedEtaBucketCount: 0,
        fallbackCount: 0,
        reason: "시뮬레이션은 대시보드 현재 Port-MIS 혼잡도 currentLevel 기준으로 계산했습니다.",
      }
    : buildForecastFreshness({
        forecast: input.congestion.forecast,
        now,
        matchedEtaBucketCount: etaForecastMatchedCount,
        fallbackCount: currentLevelFallbackCount,
      });
  const emptyReason = buildEmptyReason(summary, forecastFreshness, {
    simulationDashboardCurrent: useDashboardCurrent,
    currentLevel: input.congestion.currentLevel,
  });
  const dashboardCongestion = useDashboardCurrent
    ? {
        level: round(input.congestion.currentLevel ?? 0, 3),
        status: levelStatus(input.congestion.currentLevel ?? 0),
        ...(input.congestion.source ? { source: input.congestion.source } : {}),
        ...(input.congestion.basis ? { basis: input.congestion.basis } : {}),
      }
    : undefined;

  return {
    source: "deterministic-jit",
    ...(simulationMode ? { mode: "simulation" as const } : {}),
    ...(simulationMode ? { congestionMode } : {}),
    isFallback: input.congestion.source !== "port-mis",
    basis: simulationMode
      ? useDashboardCurrent
        ? "jit-arrival-simulation-dashboard-current-congestion"
        : "jit-arrival-simulation"
      : "jit-arrival-energy-decision",
    lastUpdated: now.toISOString(),
    dataSources: simulationMode
      ? [
          "simulated-ships",
          input.congestion.source === "port-mis" ? "port-mis-congestion" : "congestion-fallback",
          "port-mis-port-calls",
          "energy-baseline-data",
        ]
      : [
          input.congestion.source === "port-mis" ? "port-mis-congestion" : "ais-congestion-fallback",
          "ais-supabase-ships",
          "port-mis-port-calls",
          "energy-baseline-data",
        ],
    ...(dashboardCongestion ? { dashboardCongestion } : {}),
    forecastFreshness,
    decisions,
    summary,
    ...(emptyReason ? { emptyReason } : {}),
    calculationNote: simulationMode
      ? "시뮬레이션 결과는 사용자가 생성한 가상 선박 기준의 추정값이며 실제 운항 지시가 아닙니다."
      : ENERGY_ESTIMATE_DISCLAIMER,
  };
}
