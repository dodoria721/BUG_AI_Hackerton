// 연료 소모 추정 — ML 없이 "출력(kW) × SFC × 시간"으로 결정론적으로 계산한다.
//
// ★ 데이터/코드 분리 원칙 주의:
//   여기 있는 값(선종별 연료종류·SFC·정박 출력)은 "선박 도메인 상수"라서 부산항을 다른
//   항만으로 바꿔도 그대로 유효하다. 그래서 항만 고유 설정인 seed-port.ts 가 아니라 이 파일에 둔다.
//   (반대로 "혼잡도→대기시간" 환산은 항만 처리능력에 달렸으므로 seed-port.ts 쪽에 둔다.)
//
// ⚠️ 아래 HOTELING_POWER_KW 는 IMO Fourth GHG Study 2020 Table 17(보조엔진)·Table 18(보일러)의
//    "berth/anchor 단계 출력"을 축약한 **근사치**다. 원문 표에서 선종×크기구간별 정확한 kW 를
//    떠오면 이 상수만 교체하면 된다. 나머지 로직은 손댈 필요 없다.

// ── 선종 분류 ──────────────────────────────────────────────────────────
// Port-MIS 선종명(vsslKndNm, 한글)을 연료 계산이 쓰는 소수 카테고리로 접는다.
export type VesselCategory =
  | "container" // 컨테이너선
  | "bulk" // 산물선(벌크)
  | "tanker" // 유조선·석유제품/화학제품 운반선
  | "general_cargo" // 일반화물선
  | "lng" // LNG/가스 운반선
  | "passenger" // 여객선·페리·크루즈
  | "other"; // 미분류

// 키워드는 구체적인 것이 먼저 걸리도록 순서에 의미를 둔다(예: "LNG"가 "가스"보다, "석유"가 앞쪽).
const VESSEL_KEYWORDS: { category: VesselCategory; keywords: string[] }[] = [
  { category: "lng", keywords: ["LNG", "액화", "가스"] },
  { category: "tanker", keywords: ["유조", "석유", "화학", "케미컬", "제품운반", "제품 운반", "탱커"] },
  { category: "container", keywords: ["컨테이너", "컨테이너선"] },
  { category: "bulk", keywords: ["산물", "벌크", "살물", "광석", "곡물"] },
  { category: "passenger", keywords: ["여객", "페리", "카페리", "크루즈", "유람"] },
  { category: "general_cargo", keywords: ["일반화물", "화물", "잡화", "일반"] },
];

export function classifyVessel(vesselType?: string): VesselCategory {
  if (!vesselType) return "other";
  const t = vesselType.replace(/\s+/g, " ").trim();
  for (const { category, keywords } of VESSEL_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) return category;
  }
  return "other";
}

// ── 연료 종류 ──────────────────────────────────────────────────────────
// 부산항은 배출규제해역(ECA)이라 2020년부터 정박·접안 중 황함량 0.1% 이하 연료(MGO) 의무.
// 따라서 "대기(묘박/접안) 중" 연료는 선종 무관하게 대부분 MGO 로 본다. 항해 중엔 VLSFO(0.5%).
export type FuelType = "MGO" | "VLSFO" | "LNG";
export type OperatingPhase = "hoteling" | "sea"; // hoteling = 접안/묘박 대기, sea = 항해

export function fuelTypeFor(category: VesselCategory, phase: OperatingPhase): FuelType {
  if (category === "lng") return "LNG"; // 자체 화물 BOG 사용
  return phase === "hoteling" ? "MGO" : "VLSFO";
}

// ── SFC(비연료소모율) ─────────────────────────────────────────────────
// 보조엔진(중속디젤) 기준. 연료(t/h) = 출력(kW) × SFC(g/kWh) / 1e6.
const SFC_G_PER_KWH: Record<FuelType, number> = {
  MGO: 200,
  VLSFO: 205,
  LNG: 166, // 열량 환산 기준(가스 t당 발열량이 높아 질량 소모율은 낮음)
};

// ── 정박(hoteling) 출력 kW ─────────────────────────────────────────────
// [보조엔진 + 보일러] 합산 근사치. size 티어는 총톤수(GT)로 나눈다(크기구간 근사).
// ⚠️ IMO Table 17/18 정확값으로 교체 대상. 지금은 공개 문헌 통상범위 기반 근사.
type SizeTier = "small" | "medium" | "large";

function sizeTier(grossTonnage?: number): SizeTier {
  if (grossTonnage == null) return "medium"; // GT 미상이면 중간값으로 보수적 추정
  if (grossTonnage < 10_000) return "small";
  if (grossTonnage < 50_000) return "medium";
  return "large";
}

const HOTELING_POWER_KW: Record<VesselCategory, Record<SizeTier, number>> = {
  container: { small: 500, medium: 1000, large: 1700 },
  bulk: { small: 180, medium: 400, large: 600 },
  tanker: { small: 500, medium: 1200, large: 2500 }, // 화물가열·펌프용 보일러로 높음
  general_cargo: { small: 150, medium: 300, large: 500 },
  lng: { small: 1500, medium: 3000, large: 4000 }, // 재액화·화물설비 부하로 높음
  passenger: { small: 1000, medium: 3000, large: 6000 }, // 호텔부하(냉난방·조명)
  other: { small: 200, medium: 400, large: 700 },
};

// ── 계산 ───────────────────────────────────────────────────────────────
export interface FuelEstimate {
  category: VesselCategory;
  fuelType: FuelType;
  powerKw: number; // 정박 중 [보조엔진+보일러] 출력
  ratePerHourTon: number; // 시간당 연료 소모량 (t/h)
}

/** 선종·총톤수로 "정박 대기 중" 시간당 연료 소모율(t/h)을 추정한다. */
export function hotelingFuelRate(vesselType: string | undefined, grossTonnage?: number): FuelEstimate {
  const category = classifyVessel(vesselType);
  const fuelType = fuelTypeFor(category, "hoteling");
  const powerKw = HOTELING_POWER_KW[category][sizeTier(grossTonnage)];
  const ratePerHourTon = (powerKw * SFC_G_PER_KWH[fuelType]) / 1_000_000;
  return { category, fuelType, powerKw, ratePerHourTon };
}

/** 대기 시간(h)을 곱해 총 연료 소모량(t)을 구한다. 혼잡도→대기시간 환산값과 결합해 쓴다. */
export function waitingFuelTon(vesselType: string | undefined, grossTonnage: number | undefined, waitHours: number): number {
  return hotelingFuelRate(vesselType, grossTonnage).ratePerHourTon * Math.max(0, waitHours);
}
