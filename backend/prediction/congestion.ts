// 혼잡도 예측 — ML 없이 시간대별 입항 예정 선박 수를 집계해 0~1로 정규화한 통계 기반 곡선.

import type { CongestionForecast, CongestionPoint, PortConfig, Ship } from "../ports/port-types";

const FORECAST_HOURS = 12;

function hourBucketKey(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export function computeCongestionForecast(
  ships: Ship[],
  config: PortConfig,
  now: Date = new Date()
): CongestionForecast {
  const arrivingShips = ships.filter((s) => s.status === "underway");

  const startHour = new Date(now);
  startHour.setMinutes(0, 0, 0);

  const forecast: CongestionPoint[] = [];
  for (let h = 0; h < FORECAST_HOURS; h++) {
    const bucketStart = new Date(startHour.getTime() + h * 60 * 60 * 1000);
    const bucketKey = bucketStart.toISOString();

    const arrivalsInHour = arrivingShips.filter((s) => hourBucketKey(s.eta) === bucketKey).length;
    const level = Math.min(1, arrivalsInHour / config.shipsPerHourCapacity);

    forecast.push({ time: bucketKey, level: Number(level.toFixed(2)) });
  }

  const currentLevel = forecast[0]?.level ?? 0;

  return {
    port: config.name,
    currentLevel,
    forecast,
  };
}

// ── Port-MIS 기반 혼잡도 ──
// AIS 대신 Port-MIS 입항 신고 시각으로 계산한다. Port-MIS엔 도착 전 미리 낸 미래 입항 신고가
// 있어 과거 실적 + 미래 예정이 함께 있으므로, 최근 몇 시간 + 앞으로 몇 시간의 시간대별
// 입항 밀도를 그대로 곡선으로 낼 수 있다(AIS ETA 추정보다 정확).
const PORT_PAST_HOURS = 6;
const PORT_FUTURE_HOURS = 18;

export interface PortCongestionOptions {
  currentInPortCount?: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function computePortCongestionBreakdown(
  arrivals: number,
  currentInPortCount: number,
  config: PortConfig
): Pick<CongestionPoint, "level" | "arrivals" | "currentInPort" | "arrivalCapacity" | "arrivalPressure" | "inPortPressure"> {
  const arrivalCapacity = Math.max(1, config.arrivalCapacityPerHour);
  const safeArrivals = Math.max(0, arrivals);
  const safeCurrentInPort = Math.max(0, currentInPortCount);

  const arrivalPressure = clamp01(safeArrivals / arrivalCapacity);
  // 현재 정박 선박은 선석/터미널 배정을 보지 않고, Port-MIS 전수 스냅샷의 "재고 압력"으로만 반영한다.
  // 별도 체류 용량 상수를 만들지 않기 위해 기존 Port-MIS 시간당 처리량을 기준으로 0~1에 수렴시킨다.
  const inPortPressure =
    safeCurrentInPort === 0 ? 0 : clamp01(safeCurrentInPort / (safeCurrentInPort + arrivalCapacity));
  const level = clamp01(1 - (1 - arrivalPressure) * (1 - inPortPressure));

  return {
    level: round2(level),
    arrivals: safeArrivals,
    currentInPort: safeCurrentInPort,
    arrivalCapacity,
    arrivalPressure: round2(arrivalPressure),
    inPortPressure: round2(inPortPressure),
  };
}

export function computePortCongestion(
  arrivalTimesIso: string[],
  config: PortConfig,
  now: Date = new Date(),
  options: PortCongestionOptions = {}
): CongestionForecast {
  const startHour = new Date(now);
  startHour.setMinutes(0, 0, 0);
  startHour.setHours(startHour.getHours() - PORT_PAST_HOURS);
  const totalBuckets = PORT_PAST_HOURS + PORT_FUTURE_HOURS;

  const counts = new Array<number>(totalBuckets).fill(0);
  for (const iso of arrivalTimesIso) {
    const idx = Math.floor((new Date(iso).getTime() - startHour.getTime()) / 3_600_000);
    if (idx >= 0 && idx < totalBuckets) counts[idx]++;
  }

  const currentInPortCount = options.currentInPortCount ?? 0;
  const forecast: CongestionPoint[] = counts.map((c, i) => ({
    time: new Date(startHour.getTime() + i * 3_600_000).toISOString(),
    ...computePortCongestionBreakdown(c, currentInPortCount, config),
  }));

  // 현재 시각이 속한 버킷(= 과거 오프셋 다음 칸)이 지금 혼잡도.
  const currentLevel = forecast[PORT_PAST_HOURS]?.level ?? 0;

  return {
    port: config.name,
    currentLevel,
    forecast,
    source: "port-mis",
    basis: "port-mis-arrivals-and-current-in-port",
    lastUpdated: now.toISOString(),
  };
}
