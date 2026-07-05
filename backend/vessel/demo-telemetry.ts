// 단일 선박 모니터링 콘솔(/vessel)용 데모 텔레메트리.
// ⚠️ 현재 백엔드(AIS·Port-MIS)에는 엔진 계기·CII·태풍 피드가 없다. 실 피드가 붙기 전까지
//    화면을 채우기 위한 목업이며, 값은 레퍼런스 화면(HL SUNNY) 기준. 실데이터가 생기면
//    이 파일만 실 소스로 교체하면 되고, 페이지 컴포넌트는 손댈 필요 없다.

// 아래 값들은 소스가 없는 패널(CII·엔진·태풍)에서 "예시" 표기와 함께 화면을 채우는 용도.
// 실측 가능한 식별·위치·연료 등은 backend/vessel/build-view.ts 가 실데이터로 조립한다.

// ── CII 현황 ────────────────────────────────────────────────────────────
export interface CiiStatus {
  grade: string;
  index: number; // 실제 달성 CII
  required: number; // 기준 요구 CII
  marginPct: number; // 기준 대비 여유(%) — 음수면 초과
  note: string;
  regulationRiskDays: number; // 규제 리스크까지 남은 일수 (D-262)
}

export const DEMO_CII: CiiStatus = {
  grade: "B",
  index: 2.1437,
  required: 2.2816,
  marginPct: 6.0,
  note: "현재 C등급 경계 초과 상태",
  regulationRiskDays: 262,
};

// ── 엔진 모니터링 ───────────────────────────────────────────────────────
export interface EngineStatus {
  state: "NORMAL" | "WARNING" | "CRITICAL";
  rpm: number;
  loadPct: number | null;
  sfocGkwh: number; // Specific Fuel Oil Consumption
  slipPct: number;
  egtC: number; // Exhaust Gas Temperature
  loTempC: number; // Lube Oil Temp
}

export const DEMO_ENGINE: EngineStatus = {
  state: "NORMAL",
  rpm: 54,
  loadPct: null,
  sfocGkwh: 31.3,
  slipPct: 30.3,
  egtC: 301.5,
  loTempC: 40.5,
};

// ── 속도별 탄소배출 효율(CII) 곡선 ──────────────────────────────────────
// 운항속도가 오르면 배출량이 비선형(대략 3제곱)으로 늘어 CII 지수도 커진다.
// ML 없이 단조 증가 곡선으로 근사한다. 실제 CII 산식이 붙으면 이 함수만 교체.
export interface CiiCurvePoint {
  speed: number; // knots
  cii: number; // CII 지수
}

export function ciiCurveBySpeed(minKn = 8, maxKn = 13, step = 0.5): CiiCurvePoint[] {
  const points: CiiCurvePoint[] = [];
  const base = 1.15; // 최저 속도에서의 기준 지수
  for (let s = minKn; s <= maxKn + 1e-9; s += step) {
    const cii = base * Math.pow(s / minKn, 1.9); // 속도비의 ~2제곱으로 상승
    points.push({ speed: Math.round(s * 10) / 10, cii: Math.round(cii * 1000) / 1000 });
  }
  return points;
}

// CII 등급 경계(A가 가장 좋음). 곡선 배경 밴드/범례에 쓴다.
export const CII_GRADE_BANDS: { grade: string; color: string; max: number }[] = [
  { grade: "A", color: "#22c55e", max: 1.6 },
  { grade: "B", color: "#84cc16", max: 2.0 },
  { grade: "C", color: "#eab308", max: 2.4 },
  { grade: "D", color: "#f97316", max: 2.9 },
  { grade: "E", color: "#ef4444", max: 99 },
];

// ── 태풍 모니터링 ───────────────────────────────────────────────────────
export interface TyphoonPoint {
  name: string;
  latText: string;
  lonText: string;
  timeUtc: string; // YYYY-MM-DD HH:mm (UTC)
}

export const DEMO_TYPHOON: TyphoonPoint[] = [
  { name: "Sintaku", latText: "23.6°N", lonText: "145.8°E", timeUtc: "2026-04-18 00:00" },
  { name: "Sintaku", latText: "20.6°N", lonText: "144.6°E", timeUtc: "2026-04-17 00:00" },
  { name: "Sintaku", latText: "18.2°N", lonText: "144.2°E", timeUtc: "2026-04-16 00:00" },
  { name: "Sintaku", latText: "16.0°N", lonText: "145.1°E", timeUtc: "2026-04-15 00:00" },
  { name: "Sintaku", latText: "15.1°N", lonText: "145.7°E", timeUtc: "2026-04-14 12:00" },
];
