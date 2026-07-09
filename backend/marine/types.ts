// 해양기상·파랑·조위·태풍·조류·선박운항지수 도메인 타입.
// 실제 API 연동은 backend/marine/*.ts 각 파일에서 담당하고, 이 파일은 그 결과 형태만 정의한다.

// ── 해양기상 관측 (필수) ──
export interface MarineWeatherObservation {
  time: string; // 관측 시각 (ISO 8601)
  stationId: string;
  tempC?: number; // 기온(℃)
  pressureHpa?: number; // 기압(hPa)
  windSpeedMs?: number; // 풍속(m/s)
  windDeg?: number; // 풍향(deg)
  waterTempC?: number; // 수온(℃)
  humidity?: number; // 습도(%)
  visibilityM?: number; // 시정(m)
  source: string;
}

// ── 실측 파랑 (필수) ──
export interface WaveObservation {
  time: string; // 관측 시각 (ISO 8601)
  stationId: string;
  waveHeightM: number; // 유의파고(m)
  wavePeriodS?: number; // 파주기(s)
  waveDeg?: number; // 파향(deg)
  source: string;
}

// ── 조위 실측·예측 (필수) ──
export interface TideLevelPoint {
  time: string; // ISO 8601
  levelCm: number; // 조위(cm)
  type?: "고조" | "저조"; // 예측 데이터의 만조/간조 표시 (해당 시점만)
}

export interface TideObservation {
  stationId: string;
  stationName?: string;
  points: TideLevelPoint[]; // 실측 시계열
  source: string;
}

export interface TidePrediction {
  stationId: string;
  stationName?: string;
  points: TideLevelPoint[]; // 예측 시계열(고조/저조 위주)
  source: string;
}

// ── 태풍정보 (위험 알림) ──
export interface TyphoonTrackPoint {
  time: string; // ISO 8601
  lat: number;
  lon: number;
  centralPressureHpa?: number;
  maxWindSpeedMs?: number;
  forecast: boolean; // true면 예상 경로(미래), false면 실측 경로(과거)
}

export interface TyphoonInfo {
  typhoonId: string; // 발표기관 태풍 번호(예: "2508")
  name: string; // 국제 명칭
  nameKr?: string; // 한글 명칭
  status: "발생" | "소멸" | "온대저기압화" | "예보";
  track: TyphoonTrackPoint[];
  source: string;
}

// ── 조류예보 시계열 (선택) ──
export interface TidalCurrentPoint {
  time: string; // ISO 8601
  speedKn?: number; // 유속(knot)
  dirDeg?: number; // 유향(deg)
}

export interface TidalCurrentForecast {
  stationId: string;
  stationName?: string;
  points: TidalCurrentPoint[];
  source: string;
}

// ── 선박운항지수 (선택) ──
export interface ShipOperationIndexPoint {
  time: string; // ISO 8601
  index: number; // 0~100, 높을수록 안전
  grade?: string; // 발표기관 등급(예: "양호", "주의", "위험")
}

export interface ShipOperationIndex {
  zoneId?: string;
  points: ShipOperationIndexPoint[];
  source: string;
}
