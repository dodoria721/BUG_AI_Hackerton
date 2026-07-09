// AIS PositionReport(+ 캐시된 ShipStaticData)를 플랫폼의 Ship 타입으로 변환한다.

import type { Ship, ShipStatus } from "../ports/port-types";
import { BUSAN_PORT } from "../ports/seed-port";
import { computeEta } from "../prediction/eta";
import type { AisPositionReport } from "./aisstream-types";

export interface StaticInfo {
  name?: string;
  callSign?: string;
  destination?: string;
  imo?: string;
  shipType?: number; // AIS 선종코드(0~99). backend/ais/ship-type.ts
}

// ITU-R M.1371 항행 상태 코드를 플랫폼이 쓰는 3종 상태로 단순화한다.
// 1=at anchor, 5=moored, 6=aground(접안 취급) — 나머지는 속력으로 판단.
function navStatusToShipStatus(status: number, sog: number): ShipStatus {
  if (status === 1) return "anchored";
  if (status === 5 || status === 6) return "moored";
  if (sog < 0.5) return "anchored"; // 상태 코드가 불명확한데 거의 정지해 있으면 묘박으로 간주
  return "underway";
}

export function positionReportToShip(
  mmsi: string,
  metaShipName: string | undefined,
  report: AisPositionReport,
  staticInfo: StaticInfo | undefined,
  now: Date = new Date()
): Ship {
  const status = navStatusToShipStatus(report.NavigationalStatus, report.Sog);
  const name = staticInfo?.name?.trim() || metaShipName?.trim() || `MMSI ${mmsi}`;

  // 실 AIS 선박은 배정 선석 정보가 없으므로, 항해 중이면 항만 중심점을 목적지로 ETA를
  // 계산한다(이미 정박/접안했으면 도착 완료로 보고 현재 시각을 ETA로 둔다).
  const eta =
    status === "underway"
      ? computeEta({ lat: report.Latitude, lon: report.Longitude }, BUSAN_PORT.center, report.Sog, now)
      : now.toISOString();

  return {
    mmsi,
    name,
    lat: report.Latitude,
    lon: report.Longitude,
    sog: report.Sog,
    cog: report.Cog,
    eta,
    status,
    ...(staticInfo?.callSign ? { callSign: staticInfo.callSign.trim() } : {}),
    ...(staticInfo?.imo ? { imo: staticInfo.imo } : {}),
    ...(staticInfo?.shipType != null ? { aisShipType: staticInfo.shipType } : {}),
  };
}
