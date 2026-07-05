// 단일 선박 모니터링 뷰 조립 — AIS(Ship, 위치·속도)와 Port-MIS(PortCall, 식별·항로·톤수)를
// "같은 배"로 합쳐, 화면이 그대로 렌더할 수 있는 VesselView 로 만든다.
// 컴포넌트에 로직을 두지 않기 위해 매칭·파생 계산을 전부 여기(backend)에 둔다.

import type { CongestionThresholds, PortCall, Ship, ShipStatus } from "../ports/port-types";
import { classifyVessel, fuelTypeFor, hotelingFuelRate, type FuelType, type VesselCategory } from "../prediction/fuel";
import { nameSimilarity, NAME_SIMILARITY_THRESHOLD } from "../portmis/match-position";

function normCallSign(s: string | undefined): string {
  return (s ?? "").trim().toUpperCase();
}
function normName(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}

/** PortCall 한 건과 "같은 배"인 AIS 선박을 찾는다 — 호출부호 정확일치 → 선박명 유사도. */
export function matchShipForCall(call: PortCall, ships: Ship[], threshold = NAME_SIMILARITY_THRESHOLD): Ship | undefined {
  const cc = normCallSign(call.callSign);
  if (cc) {
    const byCall = ships.find((s) => normCallSign(s.callSign) === cc);
    if (byCall) return byCall;
  }
  const cn = normName(call.vesselName);
  if (!cn) return undefined;
  let best: Ship | undefined;
  let bestSim = threshold;
  for (const s of ships) {
    const sim = nameSimilarity(cn, normName(s.name));
    if (sim >= bestSim) {
      bestSim = sim;
      best = s;
    }
  }
  return best;
}

export interface VesselCandidate {
  call: PortCall;
  ship?: Ship;
}

/**
 * 모니터링 대상 후보 목록. AIS 위치가 매칭된 선박(실시간 값이 있는 배)을 앞에,
 * 그 안에서 총톤수 큰 순으로 정렬한다. 위치 매칭이 없는 배도 뒤에 붙여 식별정보라도 보여준다.
 */
export function monitorCandidates(ships: Ship[], calls: PortCall[]): VesselCandidate[] {
  const withShip: VesselCandidate[] = [];
  const withoutShip: VesselCandidate[] = [];
  for (const call of calls) {
    const ship = matchShipForCall(call, ships);
    (ship ? withShip : withoutShip).push({ call, ship });
  }
  const byGt = (a: VesselCandidate, b: VesselCandidate) => (b.call.grossTonnage ?? 0) - (a.call.grossTonnage ?? 0);
  withShip.sort(byGt);
  withoutShip.sort(byGt);
  return [...withShip, ...withoutShip];
}

export interface VesselView {
  // 식별 (Port-MIS / AIS)
  name: string;
  type: string | null; // 선종 (원문 한글)
  category: VesselCategory;
  callSign: string | null;
  mmsi: string | null;
  imo: string | null;
  nationality: string | null;
  grossTonnage: number | null;
  // 항로
  fromPort: string | null;
  toPort: string | null;
  arrivalTimeIso: string | null;
  // 실시간 (AIS)
  status: ShipStatus;
  hasLivePosition: boolean;
  speedKn: number | null;
  position: { lat: number; lon: number } | null;
  etaIso: string | null;
  remainingHours: number | null;
  // 정박/선석
  berthName: string | null;
  berthType: string | null;
  // 연료 (fuel.ts 모델 추정)
  fuelType: FuelType;
  fuelRateTonPerHour: number;
  dfocEstTonPerDay: number;
}

/** call/ship 을 합쳐 화면용 뷰로. 둘 다 없으면 null. */
export function buildVesselView(candidate: VesselCandidate | undefined, now: Date = new Date()): VesselView | null {
  if (!candidate) return null;
  const { call, ship } = candidate;
  const type = call.vesselType ?? null;
  const category = classifyVessel(type ?? undefined);
  const status: ShipStatus =
    ship?.status ?? (call.berthType === "묘박" ? "anchored" : call.berthType === "접안" ? "moored" : "underway");
  const phase = status === "underway" ? "sea" : "hoteling";
  const fuel = hotelingFuelRate(type ?? undefined, call.grossTonnage);
  const etaIso = ship?.eta ?? null;
  const remainingHours =
    etaIso && status === "underway" ? Math.max(0, (new Date(etaIso).getTime() - now.getTime()) / 3_600_000) : null;

  return {
    name: call.vesselName || ship?.name || "—",
    type,
    category,
    callSign: call.callSign || ship?.callSign || null,
    mmsi: ship?.mmsi ?? null,
    imo: ship?.imo ?? null,
    nationality: call.nationality ?? null,
    grossTonnage: call.grossTonnage ?? ship?.grossTonnage ?? null,
    fromPort: call.previousPort ?? ship?.previousPort ?? null,
    toPort: call.nextPort ?? ship?.nextPort ?? null,
    arrivalTimeIso: call.eventTime ?? null,
    status,
    hasLivePosition: !!ship,
    speedKn: ship?.sog ?? null,
    position: ship ? { lat: ship.lat, lon: ship.lon } : null,
    etaIso,
    remainingHours,
    berthName: call.berthName ?? ship?.berthName ?? null,
    berthType: call.berthType ?? null,
    fuelType: fuelTypeFor(category, phase),
    fuelRateTonPerHour: fuel.ratePerHourTon,
    dfocEstTonPerDay: fuel.ratePerHourTon * 24,
  };
}

// ── 기상 파생값 ─────────────────────────────────────────────────────────
// 풍속(m/s) → 보퍼트 계급. 상한(미만) 기준 표준 척도.
export function beaufortFromWindMs(ms: number): number {
  const upper = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  for (let i = 0; i < upper.length; i++) if (ms < upper[i]) return i;
  return 12;
}

// 풍향(deg) → 8방위 한글.
export function windDir8(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// 혼잡도 레벨(0~1) → 한글 단계.
export function congestionLabel(level: number, thresholds: CongestionThresholds): string {
  if (level <= thresholds.low) return "원활";
  if (level <= thresholds.medium) return "보통";
  return "혼잡";
}

export const STATUS_LABEL: Record<ShipStatus, string> = {
  underway: "항해 중",
  anchored: "묘박",
  moored: "접안",
};
