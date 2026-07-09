// 데모용 충돌 침로 선박 주입 — 목업/실 AIS에는 실제 근접 상황이 드물어, 관제 화면에서
// CPA/TCPA 경보가 확실히 보이도록 "지금 위험한" 선박 쌍을 합성한다.
//
// 좌표는 절대값을 박지 않고 항만 설정(접근수로 중심 → 없으면 항 중심)에서 파생한 오프셋으로
// 배치한다. seed-port.ts만 바꾸면 데모 선박도 새 항만 좌표를 따라간다(데이터/코드 분리).

import type { LatLon, PortConfig, Ship } from "../ports/port-types";

// 기준점에서 북(dNorthNm)·동(dEastNm) 방향으로 해리만큼 떨어진 좌표.
function offset(base: LatLon, dNorthNm: number, dEastNm: number): LatLon {
  const dLat = dNorthNm / 60;
  const dLon = dEastNm / (60 * Math.cos((base.lat * Math.PI) / 180));
  return { lat: base.lat + dLat, lon: base.lon + dLon };
}

// 데모 선박은 관제 대상(대형선)을 흉내 내므로 총톤수를 실어 isMonitoredVessel 필터를 통과시킨다.
const DEMO_GROSS_TONNAGE = 20000;

function demoShip(mmsi: string, name: string, pos: LatLon, sog: number, cog: number): Ship {
  return { mmsi, name, lat: pos.lat, lon: pos.lon, sog, cog, eta: "", status: "underway", grossTonnage: DEMO_GROSS_TONNAGE };
}

/**
 * 접근수로 부근에 두 개의 위험 시나리오를 만든다.
 *  1) 정면 조우(head-on): 같은 위도에서 2.5해리 간격으로 마주보고 접근 → CPA≈0 → danger.
 *  2) 추월(overtaking): 같은 침로로 뒤 선박이 빠르게 따라붙되 0.35해리 측방 이격 → warning.
 */
export function buildDemoCollisionShips(config: PortConfig): Ship[] {
  const approach = config.zones.find((z) => z.id === "zone-approach");
  const base = approach ? approach.center : config.center;

  // 1) 정면 조우 (danger)
  const headOnW = demoShip("DEMO-HEADON-W", "데모 정면A", offset(base, 0, -1.23), 12, 90); // 서→동
  const headOnE = demoShip("DEMO-HEADON-E", "데모 정면B", offset(base, 0, +1.23), 12, 270); // 동→서

  // 2) 추월 (warning) — 첫 쌍과 겹치지 않게 북서쪽으로 이동한 구역에 배치
  const cluster = offset(base, 3, -3);
  const lead = demoShip("DEMO-OVERTAKE-LEAD", "데모 추월 선두", cluster, 6, 0); // 정북 저속
  const chaser = demoShip("DEMO-OVERTAKE-CHASE", "데모 추월 후미", offset(cluster, -1.2, 0.35), 14, 0); // 정북 고속

  return [headOnW, headOnE, lead, chaser];
}
