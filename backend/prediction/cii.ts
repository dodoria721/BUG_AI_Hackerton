// CII(Carbon Intensity Indicator) 계산 — ML 없이 IMO 표준식으로 결정론적 계산.
//
// 두 부분으로 나뉜다:
//  1) Required CII + 등급(A~E) 경계  → IMO MEPC.353(78)/354(78) 공개 표준식 (견고, "표준값")
//  2) Attained CII (달성값)          → 실측 이력(IMO DCS)이 없어 대표 운항 프로파일로 "추정"
//
// ⚠️ 걸림돌: CII는 대부분 선종에서 DWT(재화중량톤) 기준인데 Port-MIS엔 GT(총톤수)만 있다.
//    → GT→DWT를 선종별 계수로 근사한다(아래 DWT_PER_GT). 이 근사가 정확도의 1차 한계다.
//
// 참고: 기준선 CII_ref = a × Capacity^(-c),  Required = (1 - Z) × CII_ref
//       등급 경계 = Required × exp(dN),  Attained/Required 비교로 A~E 부여.

import { classifyVessel, fuelTypeFor, CO2_FACTOR_TON, type FuelType, type VesselCategory } from "./fuel";

// CII 표준이 구분하는 선종. fuel.ts의 VesselCategory에서 매핑한다.
export type CiiCategory = "bulk" | "tanker" | "container" | "general_cargo" | "gas" | "lng" | "cruise";

function toCiiCategory(cat: VesselCategory): CiiCategory | null {
  switch (cat) {
    case "bulk":
      return "bulk";
    case "tanker":
      return "tanker";
    case "container":
      return "container";
    case "general_cargo":
      return "general_cargo";
    case "lng":
      return "lng"; // fuel.ts는 LPG 가스선도 lng 키워드로 접는다 — 근사로 LNG 취급
    case "passenger":
      return "cruise";
    default:
      return null; // other → CII 계산 불가
  }
}

// 탄소계수 CF(t-CO₂/t-fuel)는 fuel.ts의 CO2_FACTOR_TON을 그대로 재사용한다(IMO MEPC.376(80)
// Appendix 2 실측치, HFO(VLSFO)_f_SR_gm 경로 — fuel-factors.ts 주석대로 실무상 post-2020
// VLSFO(0.5%S) 벙커유는 이 경로를 쓴다). 예전엔 이 파일에 별도 근사 테이블(VLSFO=3.151, LFO
// 경로 오적용)을 뒀는데, fuel.ts와 어긋나 있었다 — 중복 테이블을 없애 드리프트를 막는다.

// ── 연간 감축률 Z (2019 기준선 대비) ───────────────────────────────────
const REDUCTION_BY_YEAR: Record<number, number> = { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 };
// 2027~2030 강화율은 아직 미확정 → 최신값(0.11) 유지.
function reductionFactor(year: number): number {
  if (year <= 2023) return 0.05;
  return REDUCTION_BY_YEAR[year] ?? 0.11;
}

// ── GT→DWT 근사 (DWT ≈ k × GT) ─────────────────────────────────────────
// 선종별 대표 비율. 실선값과 오차 있음 — 근사임을 전제로 쓴다.
const DWT_PER_GT: Record<CiiCategory, number> = {
  bulk: 1.75,
  tanker: 1.7,
  container: 1.1,
  general_cargo: 1.5,
  gas: 0.9,
  lng: 0.7,
  cruise: 1, // cruise는 GT 기준이라 미사용
};

export function estimateDwt(category: CiiCategory, grossTonnage: number): number {
  return grossTonnage * DWT_PER_GT[category];
}

// CII capacity 값 — cruise/ro-ro는 GT, 나머지는 DWT.
function capacityValue(category: CiiCategory, dwt: number, gt: number): number {
  if (category === "cruise") return gt;
  if (category === "bulk") return Math.min(dwt, 279_000); // 벌크는 279,000 상한
  return dwt;
}

// ── 기준선 CII_ref = a × Capacity^(-c) ─────────────────────────────────
function referenceParams(category: CiiCategory, capacity: number): { a: number; c: number } {
  switch (category) {
    case "bulk":
      return { a: 4745, c: 0.622 };
    case "tanker":
      return { a: 5247, c: 0.61 };
    case "container":
      return { a: 1984, c: 0.489 };
    case "general_cargo":
      return capacity >= 20_000 ? { a: 31_948, c: 0.792 } : { a: 588, c: 0.3885 };
    case "gas":
      return capacity >= 65_000 ? { a: 1.4405e11, c: 2.071 } : { a: 8104, c: 0.639 };
    case "lng":
      if (capacity >= 100_000) return { a: 9.827, c: 0.0 };
      return capacity >= 65_000 ? { a: 1.4479e14, c: 2.673 } : { a: 1.4779e14, c: 2.673 };
    case "cruise":
      return { a: 930, c: 0.383 };
  }
}

// 등급 경계 벡터 exp(d1..d4) — Required 대비 배수.
function ddVector(category: CiiCategory, capacity: number): [number, number, number, number] {
  switch (category) {
    case "bulk":
      return [0.86, 0.94, 1.06, 1.18];
    case "tanker":
      return [0.82, 0.93, 1.08, 1.28];
    case "container":
      return [0.83, 0.94, 1.07, 1.19];
    case "general_cargo":
      return [0.83, 0.94, 1.06, 1.19];
    case "gas":
      return capacity >= 65_000 ? [0.81, 0.91, 1.12, 1.44] : [0.85, 0.95, 1.06, 1.25];
    case "lng":
      return capacity >= 100_000 ? [0.89, 0.98, 1.06, 1.13] : [0.78, 0.92, 1.1, 1.37];
    case "cruise":
      return [0.87, 0.95, 1.06, 1.16];
  }
}

export type CiiGrade = "A" | "B" | "C" | "D" | "E";

// Attained/Required 를 등급 경계와 비교해 A~E 부여.
export function gradeFor(attained: number, boundaries: [number, number, number, number]): CiiGrade {
  const [b1, b2, b3, b4] = boundaries;
  if (attained <= b1) return "A";
  if (attained <= b2) return "B";
  if (attained <= b3) return "C";
  if (attained <= b4) return "D";
  return "E";
}

// ── Attained 추정용 대표 운항 프로파일 ─────────────────────────────────
// 실측 이력이 없어, 선종·크기별 대표 서비스속력 + 주기관 일소모량으로 추정한다.
// ⚠️ 대표 근사값(실측 아님). 실선 눈리포트/DCS 연동 시 이 표는 필요 없어진다.
interface SeaProfile {
  speedKn: number;
  meTonPerDay: { small: number; medium: number; large: number };
}
const SEA_PROFILE: Record<CiiCategory, SeaProfile> = {
  container: { speedKn: 19, meTonPerDay: { small: 40, medium: 90, large: 160 } },
  bulk: { speedKn: 13, meTonPerDay: { small: 15, medium: 28, large: 45 } },
  tanker: { speedKn: 13, meTonPerDay: { small: 18, medium: 35, large: 60 } },
  general_cargo: { speedKn: 13, meTonPerDay: { small: 10, medium: 18, large: 26 } },
  gas: { speedKn: 16, meTonPerDay: { small: 25, medium: 50, large: 90 } },
  lng: { speedKn: 18, meTonPerDay: { small: 60, medium: 100, large: 140 } },
  cruise: { speedKn: 18, meTonPerDay: { small: 40, medium: 90, large: 160 } },
};

function sizeTier(dwt: number): "small" | "medium" | "large" {
  if (dwt < 20_000) return "small";
  if (dwt < 80_000) return "medium";
  return "large";
}

export interface CiiStatus {
  category: CiiCategory;
  year: number;
  dwtEstimate: number;
  capacity: number;
  fuelType: FuelType;
  referenceCii: number; // 2019 기준선
  requiredCii: number; // 연도별 요구값
  attainedCii: number; // 추정 달성값
  grade: CiiGrade; // 추정 등급
  boundaries: [number, number, number, number]; // A/B, B/C, C/D, D/E 경계값
  marginPct: number; // Required 대비 여유(%) — 양수면 기준 이하(좋음)
}

/**
 * 선종·총톤수·연도로 CII 현황을 계산한다.
 * - Required/등급경계: IMO 표준식(신뢰도 높음, 단 DWT는 GT 근사)
 * - Attained/등급: 대표 운항 프로파일 기반 추정(참고용)
 * 선종을 CII 카테고리로 못 접으면(other) null.
 */
export function computeCiiStatus(vesselType: string | undefined, grossTonnage: number | undefined, year: number): CiiStatus | null {
  const category = toCiiCategory(classifyVessel(vesselType));
  if (!category || !grossTonnage || grossTonnage <= 0) return null;

  const dwtEstimate = estimateDwt(category, grossTonnage);
  const capacity = capacityValue(category, dwtEstimate, grossTonnage);
  if (capacity <= 0) return null;

  const { a, c } = referenceParams(category, capacity);
  const referenceCii = a * Math.pow(capacity, -c);
  const requiredCii = (1 - reductionFactor(year)) * referenceCii;

  const dd = ddVector(category, capacity);
  const boundaries = dd.map((m) => requiredCii * m) as [number, number, number, number];

  // Attained 추정
  const profile = SEA_PROFILE[category];
  const meTpd = profile.meTonPerDay[sizeTier(dwtEstimate)];
  const fuelType = fuelTypeFor(classifyVessel(vesselType), "sea");
  const co2PerDayG = meTpd * CO2_FACTOR_TON[fuelType] * 1_000_000; // g-CO₂/day
  const nmPerDay = profile.speedKn * 24;
  const attainedCii = co2PerDayG / (nmPerDay * capacity); // g-CO₂ / (capacity·nm)

  const grade = gradeFor(attainedCii, boundaries);
  const marginPct = ((requiredCii - attainedCii) / requiredCii) * 100;

  return { category, year, dwtEstimate, capacity, fuelType, referenceCii, requiredCii, attainedCii, grade, boundaries, marginPct };
}

// 등급별 색상(A 녹색 → E 적색). UI 공용.
export const CII_GRADE_COLOR: Record<CiiGrade, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  E: "#ef4444",
};
