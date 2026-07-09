import type {
  ApproachRoute,
  ApproachRouteSource,
  ApproachRouteWaypoint,
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
import { computeSeaRisk, type SeaRiskAssessment } from "../sea-risk";
import type { TyphoonInfo } from "../../marine/types";
import { computeAiRoutePoints } from "./ai-route";
import { calculatePolylineDistanceNm } from "./route-distance";
import { computeWaterPath } from "./water-path";

const AI_ROUTE_ID = "ai-computed";
const AI_ROUTE_NAME = "AI 계산 경로(위험 회피)";
const AI_ROUTE_SHORT_NAME = "AI경로";

const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_MIN_SPEED_KN = 8;
const APPROACH_VOYAGE_FUEL_LOAD_FACTOR = 0.35;

export const ROUTE_SCENARIO_CALCULATION_NOTE =
  "본 경로 추천은 해수부 항만가이드라인 지정항로 중심선을 비교한 시뮬레이션 결과이며 실제 항해 지시가 아닙니다.";

export type RouteScenarioCongestionBasis =
  | "destination-current-level"
  | "destination-eta-forecast-bucket"
  | "global-current-level-fallback";

export interface RouteScenarioResult {
  routeId: string;
  routeName: string;
  routeShortName: string;
  routeSource: ApproachRouteSource;
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
  seaRisk: SeaRiskAssessment;
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
  seaRisk: SeaRiskAssessment;
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
  seaRisk?: SeaRiskAssessment; // 미제공 시 데이터 없음(level=0, grade="정보없음")으로 처리
  typhoons?: TyphoonInfo[]; // AI 계산 경로가 회피할 활성 태풍(없으면 육지만 피한 최단 경로)
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
  // 선박 현재위치 → 항로 진입점(첫 waypoint) 구간은 직선이 아니라, 육지(영도 등)를
  // 피해 우회하는 경로로 잇는다(backend/prediction/routes/water-path.ts). 진입점 이후는
  // 지정항로 회랑 중심선을 그대로 따른다.
  const firstWaypoint = params.route.waypoints[0];
  const approach = firstWaypoint
    ? computeWaterPath({ lat: params.ship.lat, lng: params.ship.lon }, { lat: firstWaypoint.lat, lng: firstWaypoint.lng })
    : [{ lat: params.ship.lat, lng: params.ship.lon }];

  const points: RoutePolylinePoint[] = [
    { lat: approach[0].lat, lng: approach[0].lng, label: "선박 위치" },
    // approach 중간점 = 육지 우회 경유점(진입점=approach 마지막은 아래 waypoints가 다시 포함하므로 제외)
    ...approach.slice(1, -1).map((p) => ({ lat: p.lat, lng: p.lng, label: "육지 우회" })),
    ...params.route.waypoints,
  ];

  // 해수부 지정항로는 회랑 자체가 항측(항만 진입부)에서 끝난다. 여기에 항만 중심점을
  // 직선으로 덧붙이면 영도 등 육지를 가로지르므로, 지정항로는 회랑 끝점을 종점으로 둔다.
  // 반대로 손으로 찍은 경로(manual)는 종점이 항만 중심이 아닐 수 있어 중심점을 이어준다.
  if (params.route.source !== "mof-guideline-route") {
    const destinationPoint = {
      lat: params.destination.center.lat,
      lng: params.destination.center.lon,
      label: params.destination.name,
    };
    if (points.length === 1 || !samePoint(points[points.length - 1], destinationPoint)) {
      points.push(destinationPoint);
    }
  }

  return {
    routeId: params.route.id,
    routeName: params.route.name,
    points,
  };
}

// AI 계산 경로 — 해수부 지정항로 3개와 별개로, 육지+활성 태풍 위험구역(있으면)을 피해
// 계산한다(backend/prediction/routes/ai-route.ts). 선박→목적지를 통째로 한 번에 계산하면
// 장거리(30km+)에서 water-path.ts 가시성그래프가 시작·끝을 못 이어 직선으로 조용히
// 폴백하는 한계가 있어(실측 확인), 이미 안전이 검증된 지정항로 waypoint(anchorWaypoints)를
// 경유점으로 삼아 짧은 구간으로 쪼개 계산한다 — 태풍이 없으면 지정항로와 거의 같은 모양,
// 태풍이 특정 구간을 막으면 그 구간만 국지적으로 우회한다.
function buildAiRoutePolyline(params: {
  ship: EnergyDecisionShipInput;
  destination: SimulationDestinationPort;
  typhoons: TyphoonInfo[];
  anchorWaypoints: ApproachRouteWaypoint[];
}): RoutePolyline {
  const points = computeAiRoutePoints(
    { lat: params.ship.lat, lng: params.ship.lon },
    { lat: params.destination.center.lat, lng: params.destination.center.lon },
    params.typhoons,
    params.anchorWaypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng }))
  );
  const labeled: RoutePolylinePoint[] = points.map((p, index) => ({
    lat: p.lat,
    lng: p.lng,
    label: index === 0 ? "선박 위치" : index === points.length - 1 ? params.destination.name : "위험 회피 경유점",
  }));
  return { routeId: AI_ROUTE_ID, routeName: AI_ROUTE_NAME, points: labeled };
}

export function scoreRouteScenario(params: {
  estimatedCo2Kg: number;
  estimatedWaitingMinutes: number;
  congestionLevel: number;
  distanceNm: number;
  seaRiskLevel?: number; // 0~1, 미제공 시 0(데이터 없음 = 가점/감점 없음)
}): number {
  return round(
    params.estimatedCo2Kg * 0.35 +
      params.estimatedWaitingMinutes * 0.25 +
      params.congestionLevel * 100 * 0.15 +
      params.distanceNm * 0.1 +
      (params.seaRiskLevel ?? 0) * 100 * 0.15,
    2
  );
}

function buildRouteScenario(params: {
  routeMeta: { id: string; name: string; shortName: string; source: ApproachRouteSource };
  routePolyline: RoutePolyline;
  ship: EnergyDecisionShipInput;
  destination: SimulationDestinationPort;
  congestion: CongestionForecast;
  regionalCongestion?: RegionCongestionSeries[];
  enrichedShip: EnrichedShip;
  congestionMode: EnergyDecisionCongestionMode;
  seaRisk: SeaRiskAssessment;
  typhoonAvoidanceActive?: boolean; // AI 경로에서만 의미 있음 — 계산에 태풍 회피가 실제로 걸렸는지
  now: Date;
}): RouteScenarioResult {
  const isAiRoute = params.routeMeta.source === "ai-computed-route";
  // 표시 폴리라인은 호출부(computeRouteScenarioRecommendations)가 미리 만들어 넘긴다
  // — 지정항로는 buildRoutePolyline, AI 경로는 buildAiRoutePolyline. 거리는 그 경로를 그대로 적산해
  // 지도에 그려지는 선과 거리/ETA가 어긋나지 않도록 한다.
  const routePolyline = params.routePolyline;
  const distanceNm = calculatePolylineDistanceNm(routePolyline.points);
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
    seaRiskLevel: params.seaRisk.level,
  });
  const warnings = isAiRoute
    ? [
        "AI 계산 경로는 해수부 지정항로가 아닌 시뮬레이션 참고 경로이며 실제 항해 지시가 아닙니다.",
        "육지·활성 태풍 위험구역만 피해 계산했을 뿐 항로표지·수심·통항분리대는 반영하지 않으니, 실제 항해에는 반드시 해수부 지정항로(다른 후보)를 따라야 합니다.",
      ]
    : [
        "해수부 항만가이드라인 지정항로 기반 시뮬레이션 경로이며 실제 항해 지시가 아닙니다.",
        "경로 좌표는 지정항로 통항 회랑에서 추출한 중심선(운영자 검토용)입니다.",
      ];
  if (params.ship.source === "ais-snapshot") {
    warnings.push("LIVE SNAPSHOT은 원본 실제 선박을 수정하지 않고 복사한 시뮬레이션 입력입니다.");
  }
  if (params.seaRisk.grade === "높음" || params.seaRisk.grade === "위험") {
    warnings.push(
      `해상 리스크가 ${params.seaRisk.grade}(레벨 ${Math.round(params.seaRisk.level * 100)}%)입니다 — 출항 전 최신 기상특보를 확인하세요.`
    );
  }

  return {
    routeId: params.routeMeta.id,
    routeName: params.routeMeta.name,
    routeShortName: params.routeMeta.shortName,
    routeSource: params.routeMeta.source,
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
    seaRisk: params.seaRisk,
    score,
    rank: 0,
    isRecommended: false,
    reasons: [
      ...(isAiRoute
        ? [
            params.typhoonAvoidanceActive
              ? "실시간 활성 태풍 위험구역을 피해 직접 계산한 경로입니다."
              : "현재 활성 태풍이 없어 육지만 피한 최단 경로로 계산했습니다.",
          ]
        : []),
      `${params.destination.name} ${congestion.basis === "destination-current-level" ? "현재" : "ETA 시간대"} 혼잡도 ${Math.round(congestion.level * 100)}% 기준`,
      `거리 ${round(distanceNm, 1)}NM, 예상 대기 ${Math.round(congestion.waitingMinutes)}분을 함께 비교`,
      `${params.enrichedShip.matchBasis} 기준 선종·GT·연료 추정값 사용`,
      fuelInference.reason,
      params.seaRisk.dataAvailable
        ? `해상 리스크 ${params.seaRisk.grade}(레벨 ${Math.round(params.seaRisk.level * 100)}%) 반영`
        : "해상 리스크 데이터 미연동 — 리스크 가점 없이 계산",
    ],
    calculationBasis: isAiRoute
      ? [
          "route path = ship position -> MOF route waypoints (as anchors) -> destination, each short leg computed by A*-style visibility-graph search over land obstacles + active typhoon avoidance zones (backend/prediction/routes/ai-route.ts)",
          "routePolyline = map display only, not a navigational route (not an official MOF-designated route)",
          "waiting minutes = backend/data/energy estimateWaitingMinutesByCongestion()",
          "fuel kg = approach travel fuel estimate + expected waiting fuel",
          "CO2 kg = fuel kg * fuel emission factor",
          "sea risk level = weighted average of wave height / wind speed / typhoon proximity / ship operation index risk (0~1), backend/prediction/sea-risk.ts",
          "MVP weighted comparison score = CO2*0.35 + waiting*0.25 + congestion*100*0.15 + distance*0.1 + seaRisk*100*0.15",
        ]
      : [
          "route distance = current position -> MOF guideline route centerline waypoints",
          "routePolyline = map display only, not a navigational route",
          "waiting minutes = backend/data/energy estimateWaitingMinutesByCongestion()",
          "fuel kg = approach travel fuel estimate + expected waiting fuel",
          "CO2 kg = fuel kg * fuel emission factor",
          "sea risk level = weighted average of wave height / wind speed / typhoon proximity / ship operation index risk (0~1), backend/prediction/sea-risk.ts",
          "MVP weighted comparison score = CO2*0.35 + waiting*0.25 + congestion*100*0.15 + distance*0.1 + seaRisk*100*0.15",
        ],
    warnings,
    routePolyline,
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
  const seaRisk = input.seaRisk ?? computeSeaRisk({});
  const typhoons = input.typhoons ?? [];
  const results = input.ships
    .filter((ship) => ship.status === "underway" && Number.isFinite(ship.lat) && Number.isFinite(ship.lon) && ship.sog >= 3)
    .map((ship) => {
      const destination = destinationFor(portConfig, ship.destinationPortId);
      const enrichedShip = enrichShip(ship, input.portCalls ?? []);
      const destinationRoutes = routesForDestination(portConfig, destination.id);
      const mofScenarios = destinationRoutes.map((route) =>
        buildRouteScenario({
          routeMeta: { id: route.id, name: route.name, shortName: route.shortName, source: route.source },
          routePolyline: buildRoutePolyline({ ship, route, destination }),
          ship,
          destination,
          congestion: input.congestion,
          regionalCongestion: input.regionalCongestion,
          enrichedShip,
          congestionMode,
          seaRisk,
          now,
        })
      );
      // AI 계산 경로 — 지정항로 후보가 있는 도착지에만 비교 대상으로 추가한다(없으면 비교 기준이 없음).
      // anchorWaypoints: 첫 지정항로의 waypoint를 경유점으로 삼아 짧은 구간으로 쪼개 계산한다
      // (ai-route.ts 상단 주석 참고 — 장거리 단일 구간 계산은 실측상 실패해 직선 폴백됨).
      const aiScenario =
        mofScenarios.length > 0
          ? buildRouteScenario({
              routeMeta: { id: AI_ROUTE_ID, name: AI_ROUTE_NAME, shortName: AI_ROUTE_SHORT_NAME, source: "ai-computed-route" },
              routePolyline: buildAiRoutePolyline({
                ship,
                destination,
                typhoons,
                anchorWaypoints: destinationRoutes[0]?.waypoints ?? [],
              }),
              ship,
              destination,
              congestion: input.congestion,
              regionalCongestion: input.regionalCongestion,
              enrichedShip,
              congestionMode,
              seaRisk,
              typhoonAvoidanceActive: typhoons.length > 0,
              now,
            })
          : null;
      const routeScenarios = rankRouteScenarios([...mofScenarios, ...(aiScenario ? [aiScenario] : [])]);
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
    seaRisk,
    results,
    summary: {
      shipCount: results.length,
      recommendedCount: results.filter((result) => Boolean(result.recommendedRouteId)).length,
    },
  };
}
