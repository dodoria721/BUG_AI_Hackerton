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

// 재고 압력 — 현재 동시 재항 척수를 2019~2024 실측 분위수 밴드(P50/P95/P99)에 매핑한다.
// 옛 방식 n/(n+arrivalCapacity)는 실측 규모(평시 ~300척)에서 값이 0.96에 붙박이라 판별력이
// 없었다. 퍼센타일 매핑은 평시=0.5·P95=0.95·P99=0.99·역대피크=1.0 으로 전 구간 판별력을 준다.
//
// ⚠️ 전제: currentInPort 는 밴드와 "같은 경계"로 세야 한다(부산항계 안 전체 재항 선박).
//    Port-MIS 스냅샷이 부분집합만 주면 앵커가 어긋나므로, 그때는 밴드를 재보정하거나 스케일한다.
export function inPortPressureFromBands(currentInPort: number, config: PortConfig): number {
  const n = Math.max(0, currentInPort);
  const b = config.portCallCapacity.portWide;
  const pts: [number, number][] = [
    [0, 0],
    [b.p50, 0.5],
    [b.p95, 0.95],
    [b.p99, 0.99],
    [b.max, 1.0],
  ];
  if (n >= b.max) return 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (n <= x1) return clamp01(y0 + ((y1 - y0) * (n - x0)) / Math.max(1, x1 - x0));
  }
  return 1;
}

export function computePortCongestionBreakdown(
  arrivals: number,
  currentInPortCount: number,
  config: PortConfig
): Pick<CongestionPoint, "level" | "arrivals" | "currentInPort" | "arrivalCapacity" | "arrivalPressure" | "inPortPressure"> {
  const arrivalCapacity = Math.max(1, config.arrivalCapacityPerHour);
  const safeArrivals = Math.max(0, arrivals);
  const safeCurrentInPort = Math.max(0, currentInPortCount);

  // 유량 압력(얼마나 몰려오나) — 기존 유지: 시간당 입항 신고 / 처리량(실측 보정된 12).
  const arrivalPressure = clamp01(safeArrivals / arrivalCapacity);
  // 재고 압력(얼마나 찼나) — 실측 분위수 매핑으로 교체.
  const inPortPressure = safeCurrentInPort === 0 ? 0 : inPortPressureFromBands(safeCurrentInPort, config);
  // 두 축을 확률-OR 로 결합(둘 중 하나만 높아도 혼잡).
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

// ── 해수부 연안AIS 통계 기반 혼잡도 ──
// gicoms WFS 통계(해역격자×시간대별 AIS 척수)를 시간대별 합계로 받아 하루 24시간의 혼잡도 곡선으로
// 만든다. 실시간이 아니라 특정 날짜(ship_dt)의 통계이므로, "오늘 날짜에 투영한 시간대별 통항 패턴"으로
// 쓴다. ship_time은 한국 표준시(KST) 기준 시각이라, 현재 혼잡도는 KST 현재 시각에 맞춰 고른다.
export function computeAisStatsCongestion(
  hourly: readonly { hour: number; count: number; present: boolean }[],
  config: PortConfig,
  now: Date = new Date(),
  capacityOverride?: number
): CongestionForecast {
  const capacity = Math.max(1, capacityOverride ?? config.aisStatsHourlyCapacity);

  // 오늘 00시(UTC)를 기준으로 시간대 라벨을 만든다 — 곡선은 24개 시간대 패턴을 나타낸다.
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const forecast: CongestionPoint[] = hourly
    .filter((h) => h.present)
    .map((h) => ({
      time: new Date(startOfDay.getTime() + h.hour * 3_600_000).toISOString(),
      level: round2(clamp01(h.count / capacity)),
      areaVesselCount: h.count,
    }));

  // KST(UTC+9) 현재 시각에 해당하는 시간대의 혼잡도를 currentLevel로. 결측이면 관측된 시간대 평균.
  const kstHour = (now.getUTCHours() + 9) % 24;
  const currentPoint = forecast.find((p) => new Date(p.time).getUTCHours() === kstHour);
  const avgLevel = forecast.length ? forecast.reduce((a, p) => a + p.level, 0) / forecast.length : 0;

  return {
    port: config.name,
    currentLevel: currentPoint?.level ?? round2(avgLevel),
    forecast,
    source: "mof-ais-stats",
    basis: "mof-coastal-ais-hourly-vessel-count",
    lastUpdated: now.toISOString(),
  };
}

// ── 결합 혼잡도: 현재=AIS 통계(밀도), 미래=Port-MIS(입출항 예측) ──
// Port-MIS 곡선을 시간축의 기준(실제 UTC 타임스탬프·미래 입항 예측 포함)으로 삼고, 현재 시각 이하
// (현재·과거) 버킷의 혼잡도만 해수부 연안AIS 통계의 밀도로 덮어쓴다. AIS 통계의 ship_time은 KST
// 기준이라, 각 버킷의 UTC 시를 KST 시로 바꿔 매칭한다.
export function combineAisAndPortMisCongestion(
  portMis: CongestionForecast,
  aisHourly: readonly { hour: number; count: number; present: boolean }[],
  config: PortConfig,
  now: Date = new Date()
): CongestionForecast {
  const capacity = Math.max(1, config.aisStatsHourlyCapacity);

  // KST 시(0~23) → {level, count}. 관측된 시간대만.
  const byKstHour = new Map<number, { level: number; count: number }>();
  for (const h of aisHourly) {
    if (h.present) byKstHour.set(h.hour, { level: round2(clamp01(h.count / capacity)), count: h.count });
  }

  const currentHourStart = new Date(now);
  currentHourStart.setMinutes(0, 0, 0);
  const currentMs = currentHourStart.getTime();

  const forecast: CongestionPoint[] = portMis.forecast.map((p) => {
    const t = new Date(p.time);
    const kstHour = (t.getUTCHours() + 9) % 24;
    const ais = byKstHour.get(kstHour);
    // 현재·과거 버킷은 AIS 통계 밀도로 대체, 미래 버킷은 Port-MIS 예측 그대로 유지.
    if (t.getTime() <= currentMs && ais) {
      return { ...p, level: ais.level, areaVesselCount: ais.count };
    }
    return p;
  });

  const currentKstHour = (now.getUTCHours() + 9) % 24;
  const currentLevel = byKstHour.get(currentKstHour)?.level ?? portMis.currentLevel;

  return {
    port: config.name,
    currentLevel,
    forecast,
    source: "ais+port-mis",
    basis: "current=coastal-ais-density; future=port-mis-arrivals",
    lastUpdated: now.toISOString(),
  };
}
