// CPA/TCPA 기반 근접 충돌위험 탐지 — ML 없이 상대운동 기하로 결정론적으로 계산한다.
//
// VTS 관제의 핵심 지표:
//   - CPA(Closest Point of Approach): 두 선박이 지금 침로·속력을 유지할 때 앞으로 가장
//     가까워지는 거리.
//   - TCPA(Time to CPA): 그 최근접 순간까지 남은 시간.
//   CPA가 작고 TCPA가 짧으면 즉시 주의 대상이다. 관제사가 수십 척을 동시에 못 보므로,
//   이 계산으로 "지금 봐야 할 쌍"만 골라 위로 올린다(주의 분배).
//
// 좌표계: 부산항계(~수 해리) 범위라 위경도를 국소 평면(equirectangular)으로 근사한다.
//   x=동(E), y=북(N). 거리 단위는 해리(NM), 속력은 노트(kn=NM/h), 시간은 분.
// 임계값(경보 거리·시간)은 항만 고유값이라 seed-port.ts(collisionRisk)에서 온다.

import type { CollisionRiskThresholds, LatLon, PortConfig, Ship } from "../ports/port-types";
import { aisShipTypeClass } from "../ais/ship-type";

const NM_PER_DEG_LAT = 60; // 위도 1도 ≈ 60해리

interface Vec2 {
  x: number; // 동(E) 성분
  y: number; // 북(N) 성분
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const mag = (a: Vec2): number => Math.sqrt(dot(a, a));
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// 기준점(from)에서 대상(to)까지의 국소 평면 상대좌표(해리). 경도 축척은 두 지점 평균 위도로 보정.
function relativePositionNm(from: LatLon, to: LatLon): Vec2 {
  const refLat = toRad((from.lat + to.lat) / 2);
  return {
    x: (to.lon - from.lon) * NM_PER_DEG_LAT * Math.cos(refLat),
    y: (to.lat - from.lat) * NM_PER_DEG_LAT,
  };
}

// SOG(kn)·COG(deg, 정북=0 시계방향) → 속도 벡터(NM/h).
function velocityNm(sog: number, cog: number): Vec2 {
  const c = toRad(cog);
  return { x: sog * Math.sin(c), y: sog * Math.cos(c) };
}

export interface CpaResult {
  currentRangeNm: number; // 현재 두 선박 사이 거리(NM)
  cpaNm: number; // 최근접 거리(NM)
  tcpaMinutes: number; // 최근접까지 시간(분). 음수면 이미 최근접을 지나 멀어지는 중
  closing: boolean; // 서로 접근 중인가(TCPA>0)
  relativeSpeedKn: number; // 두 선박 상대속도 크기(kn) — 접근이 얼마나 빠른지
}

/**
 * 두 선박의 CPA(최근접 거리)와 TCPA(최근접까지 시간)를 계산한다.
 * 상대위치 r0, 상대속도 vRel에 대해 최근접 시각 t* = -(r0·vRel)/(vRel·vRel).
 * t*<0(이미 멀어지는 중)이면 최근접은 "현재"로 보고 현재 거리를 CPA로 반환한다.
 */
export function computeCpa(a: Ship, b: Ship): CpaResult {
  const r0 = relativePositionNm(a, b); // B의 A 기준 위치
  const vRel = sub(velocityNm(b.sog, b.cog), velocityNm(a.sog, a.cog));
  const currentRange = mag(r0);
  const vv = dot(vRel, vRel);
  const relativeSpeedKn = round(Math.sqrt(vv), 2);

  // 상대속도 0 — 거리 불변(같은 침로·속력). 최근접 = 현재 거리, 접근 아님.
  if (vv < 1e-9) {
    return {
      currentRangeNm: round(currentRange, 3),
      cpaNm: round(currentRange, 3),
      tcpaMinutes: 0,
      closing: false,
      relativeSpeedKn,
    };
  }

  const tHours = -dot(r0, vRel) / vv; // 최근접 시각(h)
  const tClamped = Math.max(0, tHours); // 과거(음수)면 현재를 최근접으로
  const rAtCpa: Vec2 = { x: r0.x + vRel.x * tClamped, y: r0.y + vRel.y * tClamped };

  return {
    currentRangeNm: round(currentRange, 3),
    cpaNm: round(mag(rAtCpa), 3),
    tcpaMinutes: round(tHours * 60, 1),
    closing: tHours > 0,
    relativeSpeedKn,
  };
}

export type RiskLevel = "danger" | "warning" | "clear";

/**
 * CPA 결과 → 위험 등급.
 * "지금 경보 링(cpaWarnNm) 밖에 있다가 침로상 그 안으로 좁혀 들어오는" 조우만 경보한다.
 * 이미 링 안(현재거리 ≤ warn)인 쌍은 붐비는 항 안에서 스쳐 지나가는 현재 상태일 뿐이라
 * (관제사가 지도에서 이미 보고 있음) 예측 경보 대상에서 뺀다 — 발전 중인 상황만 위로 올린다.
 */
export function classifyCpaRisk(cpa: CpaResult, t: CollisionRiskThresholds): RiskLevel {
  if (!cpa.closing) return "clear"; // 멀어지는 중이면 위험 아님
  if (cpa.relativeSpeedKn < t.minClosingSpeedKn) return "clear"; // 너무 느리게 좁혀짐 — 대응시간 충분
  if (cpa.currentRangeNm <= t.cpaWarnNm) return "clear"; // 이미 근접 상태(현재값) — 발전 중 예측 아님
  if (cpa.tcpaMinutes > t.tcpaHorizonMin) return "clear"; // 최근접이 한참 뒤
  if (cpa.cpaNm <= t.cpaDangerNm) return "danger";
  if (cpa.cpaNm <= t.cpaWarnNm) return "warning";
  return "clear";
}

// COLREGs 풍의 조우 형태(관제사 상황 파악 보조). 두 선박이 모두 이동 중일 때만 침로차로 구분.
export type EncounterType = "head-on" | "crossing" | "overtaking" | "indeterminate";

// 두 각도(deg)의 최소 사이각(0~180).
function angularDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export function encounterType(a: Ship, b: Ship, t: CollisionRiskThresholds): EncounterType {
  // 한쪽이 정지면 침로가 무의미 → 판정 보류(접안·묘박선으로의 접근 상황).
  if (a.sog < t.ignoreSpeedKn || b.sog < t.ignoreSpeedKn) return "indeterminate";
  const diff = angularDiff(a.cog, b.cog);
  if (diff < 45) return "overtaking"; // 비슷한 침로
  if (diff > 135) return "head-on"; // 정면
  return "crossing"; // 교차
}

export interface CloseQuartersAlert {
  aMmsi: string;
  bMmsi: string;
  aName: string;
  bName: string;
  risk: RiskLevel;
  cpaNm: number;
  tcpaMinutes: number;
  currentRangeNm: number;
  relativeSpeedKn: number;
  encounter: EncounterType;
}

const RISK_RANK: Record<RiskLevel, number> = { danger: 0, warning: 1, clear: 2 };

// 관제 분류 결과. commercial = 대형 상선(개별 충돌 경보 대상), small = 소형·작업선(제외),
// unknown = 대형 상선임을 확인할 근거가 없음(제외).
export type VesselMonitorClass = "commercial" | "small" | "unknown";

/**
 * 선박을 관제 분류로 나눈다 — "대형 상선(commercial)"을 양성 확인하는 것을 최우선으로 한다.
 *  1순위) AIS 선종코드가 있으면 그것으로 확정(대형 상선 vs 소형·작업선).
 *  2순위) 선종코드가 없으면 기타 정보로 분리:
 *         - 총톤수가 있으면 크기로(minMonitoredGrossTonnage 기준),
 *         - 없으면 IMO(상선) 유무로.
 *  근거가 전혀 없으면 unknown(소형 AIS 표적으로 보고 경보 제외).
 */
export function classifyMonitorClass(ship: Ship, t: CollisionRiskThresholds): VesselMonitorClass {
  const byType = aisShipTypeClass(ship.aisShipType);
  if (byType === "commercial") return "commercial"; // 선종코드로 대형 상선 확정
  if (byType === "small") return "small"; // 선종코드로 소형·작업선 확정

  if (ship.grossTonnage != null) return ship.grossTonnage >= t.minMonitoredGrossTonnage ? "commercial" : "small";
  if (ship.imo) return "commercial"; // 총톤수 미상이나 IMO 보유 → SOLAS 상선
  return "unknown";
}

/** VTS가 개별 충돌 경보로 관제하는 대상(대형 상선)인지 여부. */
export function isMonitoredVessel(ship: Ship, t: CollisionRiskThresholds): boolean {
  return classifyMonitorClass(ship, t) === "commercial";
}

/**
 * 선박 목록에서 근접 충돌위험이 있는 모든 쌍을 탐지해 심각도순으로 반환한다.
 * - 관제 대상(isMonitoredVessel)이 아닌 소형선은 먼저 제외.
 * - 두 선박이 모두 정지(접안·묘박)면 제외.
 * - 위험(danger)·경보(warning) 쌍만 남기고, 심각도 → 임박(TCPA) 순으로 정렬.
 */
export function detectCloseQuarters(ships: Ship[], config: PortConfig): CloseQuartersAlert[] {
  const t = config.collisionRisk;
  const monitored = ships.filter((s) => isMonitoredVessel(s, t));
  const alerts: CloseQuartersAlert[] = [];

  for (let i = 0; i < monitored.length; i++) {
    for (let j = i + 1; j < monitored.length; j++) {
      const a = monitored[i];
      const b = monitored[j];
      // 둘 다 사실상 정지 → 충돌위험 무의미.
      if (a.sog < t.ignoreSpeedKn && b.sog < t.ignoreSpeedKn) continue;

      const cpa = computeCpa(a, b);
      const risk = classifyCpaRisk(cpa, t);
      if (risk === "clear") continue;

      alerts.push({
        aMmsi: a.mmsi,
        bMmsi: b.mmsi,
        aName: a.name,
        bName: b.name,
        risk,
        cpaNm: cpa.cpaNm,
        tcpaMinutes: cpa.tcpaMinutes,
        currentRangeNm: cpa.currentRangeNm,
        relativeSpeedKn: cpa.relativeSpeedKn,
        encounter: encounterType(a, b, t),
      });
    }
  }

  return alerts.sort((x, y) => RISK_RANK[x.risk] - RISK_RANK[y.risk] || x.tcpaMinutes - y.tcpaMinutes);
}
