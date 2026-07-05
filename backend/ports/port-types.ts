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
}

export interface CongestionPoint {
  time: string; // ISO 8601
  level: number; // 0~1
  arrivals?: number; // 해당 시간대 입항 신고 건수 (Port-MIS 기반일 때)
  currentInPort?: number; // 현재 정박/항내 선박 수 (Port-MIS port_calls 스냅샷)
  arrivalCapacity?: number; // Port-MIS 시간당 입항 처리량 기준
  arrivalPressure?: number; // 입항 예정 선박 수 기반 압력
  inPortPressure?: number; // 현재 정박 선박 수 기반 압력
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
