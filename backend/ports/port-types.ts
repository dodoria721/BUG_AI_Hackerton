// 항만 도메인 타입 정의. seed-port.ts 와 예측/어드바이저 로직이 모두 이 타입을 공유한다.

export interface LatLon {
  lat: number;
  lon: number;
}

export type ShipStatus = "underway" | "anchored" | "moored";

export interface Ship {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  sog: number; // Speed Over Ground (knots)
  cog: number; // Course Over Ground (degrees, 0~360)
  eta: string; // ISO 8601
  status: ShipStatus;
  destinationBerthId?: string;

  // ── Port-MIS(해양수산부_선박운항정보) 입출항 신고 매칭 보강 필드 ──
  // AIS는 실시간 위치만 주고 "직전/다음 항구"가 없다. backend/portmis가 호출부호(callSign)
  // 또는 선박명으로 매칭해 채운다 — 전부 optional: 매칭 안 되면 그냥 비워둔다.
  callSign?: string; // 호출부호 — AIS ShipStaticData와 Port-MIS clsgn을 잇는 매칭 키
  imo?: string; // IMO 선박식별번호 (AIS ShipStaticData에서 수집)
  previousPort?: string; // 직전 출항항
  nextPort?: string; // 다음 기항지
  berthName?: string; // Port-MIS 신고상의 실제 접안/정박 시설명
  grossTonnage?: number; // 총톤수
  crewCount?: number; // 승무원수
  agentCompany?: string; // 선박관리/대리점 업체명
}

// 선석 — 선박이 접안하는 시설
export interface Berth {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number; // 동시 접안 가능 선박 수
}

// 구역 — 묘박지/접근수로 등 항만 내 기능별 영역
export interface Zone {
  id: string;
  name: string;
  center: LatLon;
  radiusKm: number;
}

// 부두/구역 — Port-MIS 선석명(예: "감천 4부두 5선석")엔 좌표가 없어, 선석명의 키워드로
// 이 목록의 부두에 매칭해 지도상 위치를 준다. 좌표는 부두 단위 대표점(근사).
export interface BerthArea {
  id: string;
  name: string;
  lat: number;
  lon: number;
  keywords: string[]; // 선석명에 이 중 하나라도 포함되면 이 부두로 분류
}

// 혼잡도 레벨(0~1)을 사람이 읽을 수 있는 단계로 나누는 경계값
export interface CongestionThresholds {
  low: number; // level <= low: 원활
  medium: number; // low < level <= medium: 보통, 초과 시 혼잡
}

// 동시 재항 척수 용량 — 2019~2024 부산항만공사 입출항 집계 27만건에서 오프라인 산출한
// 실측 상수. "동시 재항" = 부산항계 안(접안+묘박+대기 전체). 혼잡도 정규화의 분모로 쓴다.
// (P50=평시 중앙, P99=현실적 최대. 실시간 AIS/MIS도 같은 경계로 세야 분모/분자가 맞는다.)
export interface CapacityBand {
  p50: number; // 중앙(평시)
  p95: number;
  p99: number; // 권장 혼잡도 max(분모)
  max: number; // 절대 상한(역대 최대)
}

// 혼잡도→대기시간 환산에 쓰는 재항시간(dwell) 앵커. 실측 회귀 결과:
// 혼잡도가 오를수록 재항시간이 늘어난다(컨테이너 16h→20h, 탱커 20h→27h; 포화 시 P75 꼬리 큼).
export interface WaitCalibration {
  freeDwellHours: number; // 한산할 때 재항시간(중앙)
  congestedExtraHours: number; // 포화(혼잡도≈1)에서 추가되는 대기시간(P75 기준 실측)
  onsetLevel: number; // 이 혼잡도 이하에선 유의미한 대기가 거의 없음
}

// 항만 처리능력(입출항 집계 기반) — seed-port.ts 가 채운다.
export interface PortCallCapacity {
  source: string; // 산출 근거(기간)
  portWide: CapacityBand; // 전체 선박 동시 재항
  container: CapacityBand; // 컨테이너선만
  containerBerths: number; // 물리 컨테이너 선석 수(검증: container.p50 ≈ berths)
  totalBerths: number; // 부산항 전체 컨테이너 선석(북항+신항)
  dwellMedianHours: number; // 전체 재항시간 중앙값
  containerHourlyCapacity?: {
    source: string;
    defaultBasis: "mixed-800-teu" | "large-2500-teu";
    mixedCallsPerHour: number;
    largeCallsPerHour: number;
    teuPerHour: number;
    note?: string;
  };
  wait: { container: WaitCalibration; tanker: WaitCalibration; default: WaitCalibration };
  hourOfDayFactor: number[]; // [0..23] 평시=1.0 대비 계수
  monthFactor: number[]; // [0..11] 평시=1.0 대비 계수
}

// 혼잡도를 나눠 볼 지역(항).
// - 시간대별 혼잡도(곡선): 해수부 연안AIS 통계를 지역 bbox(center±radiusKm)로 조회해 계산.
// - 입항/출항 수치·미래 예측: Port-MIS 입출항 신고를 berthAreaId 로 집계.
// ⚠️ AIS 통계 격자(소해구도 ~10km)는 인접한 북항·감천을 한 셀로 묶어 분리 못 한다(신항만 분리).
//    그래서 aisSeparable=false 인 지역은 AIS 곡선이 서로 유사하게 나올 수 있다.
export interface CongestionRegion {
  id: string;
  name: string;
  center: LatLon; // AIS 통계 조회용 지역 중심
  radiusKm: number; // AIS 통계 조회용 bbox 반경
  aisHourlyCapacity: number; // AIS 시간대별 척수 → 0~1 정규화 분모(지역 규모 기반 근사)
  aisSeparable: boolean; // AIS 격자로 이 지역이 인접 지역과 분리되는지(신항 true, 북항·감천 false)
  berthAreaIds: string[]; // Port-MIS 입출항을 이 지역으로 집계할 부두들
  isDefault?: boolean; // 어느 지역에도 안 잡힌 신고를 담을 지역(정확히 하나만 true)
}

// 지역별 시간대별 혼잡도 + 입출항 요약(API 응답 단위).
export interface RegionCongestionSeries {
  id: string;
  name: string;
  currentLevel: number; // 0~1 (현재 시각 AIS 밀도)
  forecast: CongestionPoint[]; // 시간대별 곡선 (현재=AIS, 미래=Port-MIS 예측)
  arrivals: number; // 최근 activityWindowHours 시간 Port-MIS 입항 신고 수
  departures: number; // 최근 activityWindowHours 시간 Port-MIS 출항 신고 수
  activityWindowHours: number; // 입·출항 집계 창(시간) — UI 표기용
  currentVessels: number; // 현재 재항 척수 = AIS 통계 현재 시각(KST) 해역 척수
  aisSeparable: boolean; // AIS 격자 분리 가능 여부(UI 안내용)
  source: string; // 곡선 근거
}

export type SimulationDestinationPortId = "busan-north" | "gamcheon" | "busan-new";

export interface SimulationDestinationPort {
  id: SimulationDestinationPortId;
  name: string;
  shortName: string;
  center: LatLon;
  congestionRegionId: string;
}

export interface ApproachRouteWaypoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface ApproachRoute {
  id: string;
  destinationPortId: SimulationDestinationPortId;
  name: string;
  shortName: string;
  description?: string;
  source: "manual-simulation-route";
  waypoints: ApproachRouteWaypoint[];
}

export interface PortConfig {
  name: string;
  center: LatLon;
  mockAreaRadiusKm: number; // 목업 선박을 이 반경 내에 생성
  berths: Berth[];
  zones: Zone[];
  berthAreas: BerthArea[]; // 부두별 위치(선석명 분류용)
  congestionThresholds: CongestionThresholds;
  shipsPerHourCapacity: number; // (AIS 혼잡도) 시간당 처리 가능 선박 수 — 정규화 기준
  arrivalCapacityPerHour: number; // (Port-MIS 혼잡도) 시간당 입항 신고 처리량 — 정규화 기준
  // (해수부 연안AIS 통계 혼잡도) 부산 bbox(mockAreaRadiusKm) 안 시간당 AIS 척수를 level=1로 볼 포화 기준.
  // Port-MIS(입출항, 수백 척)와 달리 해역 내 모든 AIS 송신선을 세므로 규모가 훨씬 크다(전용 앵커).
  aisStatsHourlyCapacity: number;
  congestionRegions: CongestionRegion[]; // 지역별 혼잡도 분할(부산/감천/신항 등)
  simulationDestinations: SimulationDestinationPort[]; // /simulation 가상 선박 도착지 선택지
  approachRoutes: ApproachRoute[]; // /simulation 사전 정의 접근 경로 후보
  portCallCapacity: PortCallCapacity; // 동시 재항 용량·대기 보정(입출항 집계 실측)
}

export interface CongestionPoint {
  time: string; // ISO 8601
  level: number; // 0~1
  arrivals?: number; // 해당 시간대 입항 신고 건수 (Port-MIS 기반일 때)
  currentInPort?: number; // 현재 정박/항내 선박 수 (Port-MIS port_calls 스냅샷)
  arrivalCapacity?: number; // Port-MIS 시간당 입항 처리량 기준
  arrivalPressure?: number; // 입항 예정 선박 수 기반 압력
  inPortPressure?: number; // 현재 정박 선박 수 기반 압력
  areaVesselCount?: number; // 해당 시간대 해역 격자 내 AIS 척수 합계 (해수부 연안AIS 통계 기반일 때)
}

export interface CongestionForecast {
  port: string;
  currentLevel: number; // 0~1
  forecast: CongestionPoint[];
  source?: string;
  basis?: string;
  lastUpdated?: string;
}

export interface AdvisorRecommendation {
  mmsi: string;
  action: string;
  reason: string;
}

export interface AdvisorResult {
  summary: string;
  recommendations: AdvisorRecommendation[];
  peakTime: string; // ISO 8601
}

// Port-MIS(해양수산부_선박운항정보) 입출항 신고 1건. AIS(Ship)와 별개의 데이터로, 실시간
// 위경도는 없지만 부산항 입출항·정박 선박을 공식·전수로 담는다. AIS 커버리지가 희박한
// 부산신항 등도 여기엔 다 잡히므로, 지도(AIS)와 목록(Port-MIS)의 역할을 나눈다.
export type PortCallEvent = "입항" | "출항";

// 정박 형태 — 시설명(berthName)으로 파생한다. 접안=부두/선석/안벽 등 시설에 붙음,
// 묘박=박지/정박지에 닻 내리고 대기.
export type BerthType = "접안" | "묘박";

export interface PortCall {
  callSign: string;
  vesselName: string;
  vesselType?: string; // 선종 (예: 산물선, 석유제품 운반선)
  nationality?: string; // 선적국
  previousPort?: string; // 직전 출항항
  nextPort?: string; // 다음 기항지
  event: PortCallEvent; // 가장 최근 신고 종류
  eventTime?: string; // ISO 8601 — 해당 신고 시각
  berthName?: string; // 접안/정박 시설명
  berthType?: BerthType; // 접안 | 묘박 (berthName에서 파생)
  berthAreaId?: string; // 매칭된 부두(BerthArea) id — 지도 분류용 (berthName에서 파생)
  grossTonnage?: number; // 총톤수
}
