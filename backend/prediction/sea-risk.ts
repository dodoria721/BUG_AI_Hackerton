// 해상 리스크(seaRisk) 평가 — ML 없이 실측 파고·풍속·태풍 근접도·선박운항지수를
// 구간별 위험도 곡선(0~1)으로 환산해 가중 평균하는 결정론적 계산. 외부 상태 없음(순수 함수).
// 데이터 수집(네트워크 호출)은 backend/marine/sea-risk-source.ts 가 담당하고, 이 파일은
// 이미 관측된 값만 받아 계산한다.

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// 구간 사이를 선형보간한다. points는 x 오름차순, y는 증가/감소 어느 쪽이어도 된다.
function interpolateRisk(x: number, points: Array<[number, number]>): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

// 유의파고(m) → 위험도. 항만 소형선 통항 기준 체감 구간(0~1m 원활, 3m+ 위험).
const WAVE_RISK_POINTS: Array<[number, number]> = [
  [0, 0],
  [1, 0.3],
  [2, 0.6],
  [3, 1],
];

// 풍속(m/s) → 위험도. 기상청 강풍주의보(14m/s)·폭풍주의보(21m/s) 특보 기준 근사.
const WIND_RISK_POINTS: Array<[number, number]> = [
  [0, 0],
  [8, 0.2],
  [14, 0.6],
  [20, 1],
];

// 태풍 중심까지 거리(km) → 위험도. 가까울수록 위험(내림차순 y).
const TYPHOON_RISK_POINTS: Array<[number, number]> = [
  [0, 1],
  [150, 0.7],
  [300, 0.3],
  [500, 0],
];

export type SeaRiskGrade = "정보없음" | "낮음" | "보통" | "높음" | "위험";

export interface SeaRiskFactor {
  key: "wave" | "wind" | "typhoon" | "operationIndex";
  label: string;
  value: number;
  risk: number; // 0~1, 이 요소만의 위험도
  detail: string;
}

export interface SeaRiskAssessment {
  level: number; // 0~1, 높을수록 위험 — 가용 요소 가중 평균
  grade: SeaRiskGrade;
  factors: SeaRiskFactor[]; // 실제 값이 있었던 요소만 포함
  basis: string[]; // 산출 근거/데이터 미가용 사유
  dataAvailable: boolean;
}

export interface SeaRiskInputs {
  waveHeightM?: number; // 실측 유의파고(m)
  windSpeedMs?: number; // 해양기상 풍속(m/s)
  typhoonDistanceKm?: number; // 최근접 태풍 중심까지 거리(km)
  operationIndex?: number; // 선박운항지수(0~100, 높을수록 안전)
}

function gradeFor(level: number, dataAvailable: boolean): SeaRiskGrade {
  if (!dataAvailable) return "정보없음";
  if (level < 0.25) return "낮음";
  if (level < 0.5) return "보통";
  if (level < 0.75) return "높음";
  return "위험";
}

interface WeightedFactor extends SeaRiskFactor {
  weight: number;
}

/**
 * 관측값이 있는 요소만으로 해상 리스크를 가중 평균한다.
 * 요소가 하나도 없으면 level=0, grade="정보없음"을 반환한다(위험 없음이 아니라 "모름"임에 유의).
 */
export function computeSeaRisk(inputs: SeaRiskInputs): SeaRiskAssessment {
  const weighted: WeightedFactor[] = [];

  if (inputs.waveHeightM != null && Number.isFinite(inputs.waveHeightM)) {
    const value = Math.max(0, inputs.waveHeightM);
    weighted.push({
      key: "wave",
      label: "유의파고",
      value,
      risk: interpolateRisk(value, WAVE_RISK_POINTS),
      detail: `실측 파고 ${value.toFixed(1)}m`,
      weight: 0.35,
    });
  }

  if (inputs.windSpeedMs != null && Number.isFinite(inputs.windSpeedMs)) {
    const value = Math.max(0, inputs.windSpeedMs);
    weighted.push({
      key: "wind",
      label: "풍속",
      value,
      risk: interpolateRisk(value, WIND_RISK_POINTS),
      detail: `해양기상 풍속 ${value.toFixed(1)}m/s`,
      weight: 0.25,
    });
  }

  if (inputs.typhoonDistanceKm != null && Number.isFinite(inputs.typhoonDistanceKm)) {
    const value = Math.max(0, inputs.typhoonDistanceKm);
    weighted.push({
      key: "typhoon",
      label: "태풍 근접도",
      value,
      risk: interpolateRisk(value, TYPHOON_RISK_POINTS),
      detail: `최근접 태풍 중심까지 ${Math.round(value)}km`,
      weight: 0.25,
    });
  }

  if (inputs.operationIndex != null && Number.isFinite(inputs.operationIndex)) {
    const value = clamp(inputs.operationIndex, 0, 100);
    weighted.push({
      key: "operationIndex",
      label: "선박운항지수",
      value,
      risk: clamp(1 - value / 100, 0, 1),
      detail: `선박운항지수 ${Math.round(value)} (높을수록 안전)`,
      weight: 0.15,
    });
  }

  const dataAvailable = weighted.length > 0;
  const totalWeight = weighted.reduce((sum, f) => sum + f.weight, 0);
  const level = dataAvailable
    ? round(weighted.reduce((sum, f) => sum + f.risk * f.weight, 0) / totalWeight, 3)
    : 0;

  const factors: SeaRiskFactor[] = weighted.map(({ weight: _weight, ...factor }) => factor);

  return {
    level,
    grade: gradeFor(level, dataAvailable),
    factors,
    basis: dataAvailable
      ? [`${factors.length}개 해양 관측 요소(${factors.map((f) => f.label).join("·")}) 가중 평균`]
      : ["해양기상/파랑/태풍/선박운항지수 실측 데이터가 아직 연동되지 않아 리스크를 산출하지 못했습니다."],
    dataAvailable,
  };
}
