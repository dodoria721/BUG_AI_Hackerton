// 혼잡도 → 예상 접안 대기시간(h) 환산 — ML 없이 실측 보정 곡선으로 계산한다.
//
// 근거(backend/ports/seed-port.ts portCallCapacity.wait):
//   2019~2024 입출항 집계에서 "입항 시점 혼잡도 vs 재항시간"을 회귀한 결과,
//   혼잡도가 오를수록 재항시간이 늘어난다(컨테이너 16→20h, 탱커 20→27h; 포화 시 P75 꼬리 큼).
//   그 증가분(= 접안 대기)을 onsetLevel 이후 제곱으로 램프업하는 곡선으로 근사한다.
//
// 데이터/코드 분리: 곡선의 앵커값(freeDwell/congestedExtra/onset)은 항만 실측이라 seed-port.ts에,
// 곡선 함수 자체(순수 계산)만 여기에 둔다.

import type { PortConfig, WaitCalibration } from "../ports/port-types";
import { classifyVessel } from "./fuel";

// 혼잡도 계산 스코프. Port-MIS 혼잡도(전체선박)면 "portWide", 컨테이너 관제면 "container".
export type CapacityScope = "portWide" | "container";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 현재 동시 재항 척수 → 혼잡도(0~1, 1 초과 가능). 분모는 실측 P99. */
export function congestionLevel(currentInPort: number, config: PortConfig, scope: CapacityScope = "portWide"): number {
  const band = config.portCallCapacity[scope];
  return Math.max(0, currentInPort) / band.p99;
}

// 선종 → 대기 보정 앵커 선택(컨테이너/탱커/기타).
function calibrationFor(vesselType: string | undefined, config: PortConfig): WaitCalibration {
  const c = classifyVessel(vesselType);
  const w = config.portCallCapacity.wait;
  if (c === "container") return w.container;
  if (c === "tanker" || c === "lng") return w.tanker;
  return w.default;
}

/**
 * 혼잡도(0~1)로부터 예상 접안 대기시간(h)을 추정한다.
 * onsetLevel 이하: 대기≈0(선석 여유). 이후 (level-onset)/(1-onset) 을 제곱으로 램프업해
 * 포화(level≥1)에서 congestedExtraHours 에 수렴. 선종별 앵커는 seed-port.ts.
 */
export function estimateWaitingHours(level: number, vesselType: string | undefined, config: PortConfig): number {
  const cal = calibrationFor(vesselType, config);
  if (level <= cal.onsetLevel) return 0;
  const x = clamp((level - cal.onsetLevel) / (1 - cal.onsetLevel), 0, 1.5); // 1 초과 혼잡 허용
  return cal.congestedExtraHours * x * x;
}

/** 현재 동시 재항 척수에서 바로 예상 대기시간(h)까지. */
export function waitingHoursFromInPort(
  currentInPort: number,
  vesselType: string | undefined,
  config: PortConfig,
  scope: CapacityScope = "portWide"
): { level: number; waitHours: number } {
  const level = congestionLevel(currentInPort, config, scope);
  return { level: Number(level.toFixed(3)), waitHours: Number(estimateWaitingHours(level, vesselType, config).toFixed(1)) };
}
