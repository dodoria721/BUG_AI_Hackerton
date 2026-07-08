import type {
  ApproachRoute,
  CongestionForecast,
  CongestionPoint,
  PortCall,
  PortConfig,
  RegionCongestionSeries,
  SimulationDestinationPort,
  SimulationDestinationPortId,
} from "../../ports/port-types";
import { BUSAN_PORT } from "../../ports/seed-port";
import {
  estimateWaitingMinutesByCongestion,
  findVesselSpecByImo,
  findVesselSpecByMmsi,
  findVesselSpecByName,
  getFuelEmissionFactor,
  getWaitingFuelKgPerHour,
  inferFuelType,
  normalizeShipName,
  normalizeVesselType,
} from "../../data/energy";
import type { CongestionWaitingStatus, NormalizedVesselType, ShipSizeClass } from "../../data/energy";
import type { EnergyDecisionCongestionMode, EnergyDecisionShipInput, ScenarioShipSource } from "../energy-decision";
import { calculateApproachRouteDistanceNm } from "./route-distance";

const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_MIN_SPEED_KN = 8;
const APPROACH_VOYAGE_FUEL_LOAD_FACTOR = 0.35;

export const ROUTE_SCENARIO_CALCULATION_NOTE =
  "본 경로 추천은 사전 정의된 접근 경로 후보를 비교한 시뮬레이션 결과이며 실제 항해 지시가 아닙니다.";

export type RouteScenarioCongestionBasis =
  | "destination-current-level"
  | "destination-eta-forecast-bucket"
  | "global-current-level-fallback";

export interface RouteScenarioResult {
  routeId: string;
  routeName: string;
  routeShortName: string;
  routeSource: "manual-simulation-route";
  destinationPortId: SimulationDestinationPortId;
  destinationPortName: string;
  distanceNm: number;
  currentSpeedKn: number;
  eta: string;
  congestionLevel: number;
  congestionStatus: CongestionWaitingStatus;
  congestionBasis: RouteScenarioCongestionBasis;
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

export interface RouteScenarioShipResult {
  shipId?: string;
  shipName: string;
  scenarioSource?: ScenarioShipSource;
  originalShipId?: string;
  mmsi?: string;
  imo?: string;
  callSign?: string;
  snapshotAt?: string;
  destinationPortId: SimulationDestinationPortId;
  destinationPortName: string;
  recommendedRouteId?: string;
  recommendedRouteName?: string;
  recommendedRouteShortName?: string;
  routeScenarios: RouteScenarioResult[];
  warnings: string[];
}

export interface RouteScenarioSummary {
  shipCount: number;
  recommendedCount: number;
}

export interface RouteScenarioComputationResult {
  source: "deterministic-route-scenario";
  mode: "simulation";
  basis: "predefined-approach-route-comparison";
  lastUpdated: string;
  calculationNote: string;
  results: RouteScenarioShipResult[];
  summary: RouteScenarioSummary;
}

export interface ComputeRouteScenarioRecommendationsInput {
  ships: EnergyDecisionShipInput[];
  congestion: CongestionForecast;
  regionalCongestion?: RegionCongestionSeries[];
  portCalls?: PortCall[];
  portConfig?: PortConfig;
  now?: Date;
  congestionMode?: EnergyDecisionCongestionMode;
}

interface EnrichedShip {
  vesselType?: string;
  grossTonnage?: number;
  imo?: string;
  callSign?: string;
  normalizedVesselType: NormalizedVesselType;
  sizeClass: ShipSizeClass;
  matchBasis: string;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * MS_PER_HOUR);
}

function defaultDestination(portConfig: PortConfig): SimulationDestinationPort {
  return (
    portConfig.simulationDestinations[0] ?? {
      id: "busan-north",
      name: "부산항 북항",
      shortName: "북항",
      center: portConfig.center,
      congestionRegionId: "busan",
    }
  );
}

function destinationFor(portConfig: PortConfig, destinationPortId?: SimulationDestinationPortId): SimulationDestinationPort {
  return (
    portConfig.simulationDestinations.find((destination) => destination.id === destinationPortId) ??
    defaultDestination(portConfig)
  );
}

function regionalSeriesForDestination(
  regionalCongestion: RegionCongestionSeries[] | undefined,
  destination: SimulationDestinationPort
): RegionCongestionSeries | undefined {
  return regionalCongestion?.find((region) => region.id === destination.congestionRegionId);
}

function findForecastBucket(forecast: CongestionPoint[], eta: Date): CongestionPoint | undefined {
  const etaMs = eta.getTime();
  return forecast.find((point) => {
    const start = new Date(point.time).getTime();
    return Number.isFinite(start) && etaMs >= start && etaMs < start + MS_PER_HOUR;
  });
}

function congestionForRoute(params: {
  congestion: CongestionForecast;
  regionalCongestion?: RegionCongestionSeries[];
  destination: SimulationDestinationPort;
  eta: Date;
  congestionMode: EnergyDecisionCongestionMode;
}): {
  level: number;
  status: CongestionWaitingStatus;
  basis: RouteScenarioCongestionBasis;
  waitingMinutes: number;
} {
  const region = regionalSeriesForDestination(params.regionalCongestion, params.destination);
  const forecast = region?.forecast.length ? region.forecast : params.congestion.forecast;

  if (params.congestionMode === "eta-forecast") {
    const bucket = findForecastBucket(forecast, params.eta);
    if (bucket) {
      const waiting = estimateWaitingMinutesByCongestion(bucket.level);
      return {
        level: bucket.level,
        status: waiting.status,
        basis: region ? "destination-eta-forecast-bucket" : "global-current-level-fallback",
        waitingMinutes: waiting.waitingMinutes,
      };
    }
  }

  const level = region?.currentLevel ?? params.congestion.currentLevel ?? 0;
  const waiting = estimateWaitingMinutesByCongestion(level);
  return {
    level,
    status: waiting.status,
    basis: region ? "destination-current-level" : "global-current-level-fallback",
    waitingMinutes: waiting.waitingMinutes,
  };
}

function findPortCall(ship: EnergyDecisionShipInput, portCalls: PortCall[]): PortCall | undefined {
  const callSign = ship.callSign?.trim().toUpperCase();
  if (callSign) {
    const byCallSign = portCalls.find((call) => call.callSign?.trim().toUpperCase() === callSign);
    if (byCallSign) return byCallSign;
  }

  const shipName = normalizeShipName(ship.name);
  if (!shipName) return undefined;
  return portCalls.find((call) => normalizeShipName(call.vesselName) === shipName);
}

function enrichShip(ship: EnergyDecisionShipInput, portCalls: PortCall[]): EnrichedShip {
  const spec =
    findVesselSpecByMmsi(ship.mmsi) ??
    findVesselSpecByImo(ship.imo) ??
    findVesselSpecByName(ship.name);
  const portCall = findPortCall(ship, portCalls);
  const vesselType = ship.vesselType ?? portCall?.vesselType ?? spec?.vesselType;
  const grossTonnage = ship.grossTonnage ?? portCall?.grossTonnage ?? spec?.grossTonnage;
  const normalizedVesselType = normalizeVesselType(vesselType);
  const waitingFuel = getWaitingFuelKgPerHour({ grossTonnage, vesselType });

  return {
    ...(vesselType ? { vesselType } : {}),
    ...(grossTonnage != null ? { grossTonnage } : {}),
    ...(ship.imo ?? spec?.imo ? { imo: ship.imo ?? spec?.imo } : {}),
    ...(ship.callSign ?? portCall?.callSign ? { callSign: ship.callSign ?? portCall?.callSign } : {}),
    normalizedVesselType,
    sizeClass: waitingFuel.sizeClass,
    matchBasis: ship.source === "ais-snapshot" ? "ais-snapshot-with-port-mis-fallback" : "scenario-input",
  };
}

function scenarioSource(ship: EnergyDecisionShipInput): ScenarioShipSource {
  return ship.source === "ais-snapshot" ? "ais-snapshot" : "manual";
}

function routesForDestination(portConfig: PortConfig, destinationPortId: SimulationDestinationPortId): ApproachRoute[] {
  return portConfig.approachRoutes.filter((route) => route.destinationPortId === destinationPortId);
}

function samePoint(a: RoutePolylinePoint | undefined, b: RoutePolylinePoint): boolean {
  return Boolean(a) && Math.abs(a!.lat - b.lat) < 0.0001 && Math.abs(a!.lng - b.lng) < 0.0001;
}

function buildRoutePolyline(params: {
  ship: EnergyDecisionShipInput;
  route: ApproachRoute;
  destination: SimulationDestinationPort;
}): RoutePolyline {
  const destinationPoint = {
    lat: params.destination.center.lat,
    lng: params.destination.center.lon,
    label: params.destination.name,
  };
  const points: RoutePolylinePoint[] = [
    { lat: params.ship.lat, lng: params.ship.lon, label: "선박 위치" },
    ...params.route.waypoints,
  ];
  if (points.length === 1 || !samePoint(points[points.length - 1], destinationPoint)) {
    points.push(destinationPoint);
  }

  return {
    routeId: params.route.id,
    routeName: params.route.name,
    points,
  };
}

export function scoreRouteScenario(params: {
  estimatedCo2Kg: number;
  estimatedWaitingMinutes: number;
  congestionLevel: number;
  distanceNm: number;
}): number {
  return round(
    params.estimatedCo2Kg * 0.4 +
      params.estimatedWaitingMinutes * 0.3 +
      params.congestionLevel * 100 * 0.2 +
      params.distanceNm * 0.1,
    2
  );
}

function buildRouteScenario(params: {
  route: ApproachRoute;
  ship: EnergyDecisionShipInput;
  destination: SimulationDestinationPort;
  congestion: CongestionForecast;
  regionalCongestion?: RegionCongestionSeries[];
  enrichedShip: EnrichedShip;
  congestionMode: EnergyDecisionCongestionMode;
  now: Date;
}): RouteScenarioResult {
  const distanceNm = calculateApproachRouteDistanceNm({
    origin: { lat: params.ship.lat, lng: params.ship.lon },
    route: params.route,
    fallbackDestination: { lat: params.destination.center.lat, lng: params.destination.center.lon },
  });
  const currentSpeedKn = Math.max(0.1, params.ship.sog);
  const travelHours = distanceNm / currentSpeedKn;
  const etaDate = addHours(params.now, travelHours);
  const congestion = congestionForRoute({
    congestion: params.congestion,
    regionalCongestion: params.regionalCongestion,
    destination: params.destination,
    eta: etaDate,
    congestionMode: params.congestionMode,
  });
  const waitHours = congestion.waitingMinutes / 60;
  const idealSpeedKn = distanceNm > 0 ? distanceNm / (travelHours + waitHours) : currentSpeedKn;
  const recommendedSpeedKn = Math.min(currentSpeedKn, Math.max(DEFAULT_MIN_SPEED_KN, idealSpeedKn));
  const recommendedTravelHours = distanceNm / Math.max(0.1, recommendedSpeedKn);
  const recommendedEtaDate = addHours(params.now, recommendedTravelHours);
  const reducedWaitingMinutes = Math.min(
    congestion.waitingMinutes,
    Math.max(0, (recommendedTravelHours - travelHours) * 60)
  );
  const waitingFuel = getWaitingFuelKgPerHour({
    grossTonnage: params.enrichedShip.grossTonnage,
    vesselType: params.enrichedShip.vesselType,
  });
  const fuelInference = inferFuelType({
    grossTonnage: params.enrichedShip.grossTonnage,
    vesselType: params.enrichedShip.vesselType,
  });
  const fuelFactor = getFuelEmissionFactor(fuelInference.fuelType);
  const voyageFuelKg = travelHours * waitingFuel.kgPerHour * APPROACH_VOYAGE_FUEL_LOAD_FACTOR;
  const waitingFuelKg = waitHours * waitingFuel.kgPerHour;
  const estimatedFuelKg = voyageFuelKg + waitingFuelKg;
  const estimatedCo2Kg = estimatedFuelKg * fuelFactor.cfTco2PerTon;
  const estimatedFuelSavedKg = (reducedWaitingMinutes / 60) * waitingFuel.kgPerHour;
  const estimatedCo2ReducedKg = estimatedFuelSavedKg * fuelFactor.cfTco2PerTon;
  const score = scoreRouteScenario({
    estimatedCo2Kg,
    estimatedWaitingMinutes: congestion.waitingMinutes,
    congestionLevel: congestion.level,
    distanceNm,
  });
  const warnings = [
    "시뮬레이션용 사전 정의 접근 경로 후보이며 실제 항해 지시가 아닙니다.",
    "경로 좌표는 운영자 검토용 수동 시나리오 경로입니다.",
  ];
  if (params.ship.source === "ais-snapshot") {
    warnings.push("LIVE SNAPSHOT은 원본 실제 선박을 수정하지 않고 복사한 시뮬레이션 입력입니다.");
  }

  return {
    routeId: params.route.id,
    routeName: params.route.name,
    routeShortName: params.route.shortName,
    routeSource: params.route.source,
    destinationPortId: params.destination.id,
    destinationPortName: params.destination.name,
    distanceNm: round(distanceNm, 1),
    currentSpeedKn: round(currentSpeedKn, 1),
    eta: etaDate.toISOString(),
    congestionLevel: round(congestion.level, 3),
    congestionStatus: congestion.status,
    congestionBasis: congestion.basis,
    estimatedWaitingMinutes: Math.round(congestion.waitingMinutes),
    recommendedSpeedKn: round(recommendedSpeedKn, 1),
    recommendedEta: recommendedEtaDate.toISOString(),
    reducedWaitingMinutes: Math.round(reducedWaitingMinutes),
    estimatedFuelKg: Math.round(estimatedFuelKg),
    estimatedCo2Kg: Math.round(estimatedCo2Kg),
    estimatedFuelSavedKg: Math.round(estimatedFuelSavedKg),
    estimatedCo2ReducedKg: Math.round(estimatedCo2ReducedKg),
    score,
    rank: 0,
    isRecommended: false,
    reasons: [
      `${params.destination.name} ${congestion.basis === "destination-current-level" ? "현재" : "ETA 시간대"} 혼잡도 ${Math.round(congestion.level * 100)}% 기준`,
      `거리 ${round(distanceNm, 1)}NM, 예상 대기 ${Math.round(congestion.waitingMinutes)}분을 함께 비교`,
      `${params.enrichedShip.matchBasis} 기준 선종·GT·연료 추정값 사용`,
      fuelInference.reason,
    ],
    calculationBasis: [
      "route distance = current position -> predefined approach waypoints",
      "routePolyline = map display only, not a navigational route",
      "waiting minutes = backend/data/energy estimateWaitingMinutesByCongestion()",
      "fuel kg = approach travel fuel estimate + expected waiting fuel",
      "CO2 kg = fuel kg * fuel emission factor",
      "MVP weighted comparison score = CO2*0.4 + waiting*0.3 + congestion*100*0.2 + distance*0.1",
    ],
    warnings,
    routePolyline: buildRoutePolyline({
      ship: params.ship,
      route: params.route,
      destination: params.destination,
    }),
  };
}

function rankRouteScenarios(scenarios: RouteScenarioResult[]): RouteScenarioResult[] {
  return scenarios
    .sort((a, b) => a.score - b.score || a.distanceNm - b.distanceNm)
    .map((scenario, index) => ({
      ...scenario,
      rank: index + 1,
      isRecommended: index === 0,
      reasons:
        index === 0
          ? ["MVP 가중 비교 점수가 가장 낮은 접근 경로 후보입니다.", ...scenario.reasons]
          : scenario.reasons,
    }));
}

export function computeRouteScenarioRecommendations(
  input: ComputeRouteScenarioRecommendationsInput
): RouteScenarioComputationResult {
  const portConfig = input.portConfig ?? BUSAN_PORT;
  const now = input.now ?? new Date();
  const congestionMode = input.congestionMode ?? "dashboard-current";
  const results = input.ships
    .filter((ship) => ship.status === "underway" && Number.isFinite(ship.lat) && Number.isFinite(ship.lon) && ship.sog >= 3)
    .map((ship) => {
      const destination = destinationFor(portConfig, ship.destinationPortId);
      const routeScenarios = rankRouteScenarios(
        routesForDestination(portConfig, destination.id).map((route) =>
          buildRouteScenario({
            route,
            ship,
            destination,
            congestion: input.congestion,
            regionalCongestion: input.regionalCongestion,
            enrichedShip: enrichShip(ship, input.portCalls ?? []),
            congestionMode,
            now,
          })
        )
      );
      const recommended = routeScenarios.find((scenario) => scenario.isRecommended);

      return {
        ...(ship.id ? { shipId: ship.id } : {}),
        shipName: ship.name,
        scenarioSource: scenarioSource(ship),
        ...(ship.originalShipId ? { originalShipId: ship.originalShipId } : {}),
        ...(ship.mmsi ? { mmsi: ship.mmsi } : {}),
        ...(ship.imo ? { imo: ship.imo } : {}),
        ...(ship.callSign ? { callSign: ship.callSign } : {}),
        ...(ship.snapshotAt ? { snapshotAt: ship.snapshotAt } : {}),
        destinationPortId: destination.id,
        destinationPortName: destination.name,
        ...(recommended
          ? {
              recommendedRouteId: recommended.routeId,
              recommendedRouteName: recommended.routeName,
              recommendedRouteShortName: recommended.routeShortName,
            }
          : {}),
        routeScenarios,
        warnings:
          routeScenarios.length > 0
            ? []
            : ["선택 도착지에 사전 정의된 접근 경로 후보가 없어 비교 결과를 만들 수 없습니다."],
      };
    });

  return {
    source: "deterministic-route-scenario",
    mode: "simulation",
    basis: "predefined-approach-route-comparison",
    lastUpdated: now.toISOString(),
    calculationNote: ROUTE_SCENARIO_CALCULATION_NOTE,
    results,
    summary: {
      shipCount: results.length,
      recommendedCount: results.filter((result) => Boolean(result.recommendedRouteId)).length,
    },
  };
}
