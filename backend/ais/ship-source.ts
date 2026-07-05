// 선박 데이터 소스 — DB(Supabase)에서 읽고, 미설정/오류/빈 테이블이면 목업으로 폴백한다.
// 이 파일이 Ship[] 타입만 지키면 prediction/advisor/frontend 는 수정할 필요가 없다.

import type { Ship } from "../ports/port-types";
import type { StaticInfo } from "./normalize";
import { MOCK_SHIPS } from "./mock-data";
import { getSupabase } from "../db/supabase";

// DB 컬럼(snake_case) ↔ 도메인 타입(camelCase) 매핑
interface ShipRow {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  eta: string;
  status: Ship["status"];
  destination_berth_id: string | null;
  call_sign: string | null;
  imo: string | null; // AIS ShipStaticData 식별번호 — 위치 flush가 아니라 정적 flush(staticInfoToRow)로만 채운다
  // ── Port-MIS 보강 필드 — shipToRow는 이 컬럼들을 절대 쓰지 않는다(아래 주석 참고) ──
  previous_port: string | null;
  next_port: string | null;
  berth_name: string | null;
  gross_tonnage: number | null;
  crew_count: number | null;
  agent_company: string | null;
}

function rowToShip(r: ShipRow): Ship {
  return {
    mmsi: r.mmsi,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    sog: r.sog,
    cog: r.cog,
    eta: new Date(r.eta).toISOString(),
    status: r.status,
    ...(r.destination_berth_id ? { destinationBerthId: r.destination_berth_id } : {}),
    ...(r.call_sign ? { callSign: r.call_sign } : {}),
    ...(r.imo ? { imo: r.imo } : {}),
    ...(r.previous_port ? { previousPort: r.previous_port } : {}),
    ...(r.next_port ? { nextPort: r.next_port } : {}),
    ...(r.berth_name ? { berthName: r.berth_name } : {}),
    ...(r.gross_tonnage != null ? { grossTonnage: r.gross_tonnage } : {}),
    ...(r.crew_count != null ? { crewCount: r.crew_count } : {}),
    ...(r.agent_company ? { agentCompany: r.agent_company } : {}),
  };
}

/**
 * Ship → DB row (seed/insert 용, MOCK_SHIPS 시딩에서만 사용). 목업은 한 번만 넣으므로
 * 식별 필드(call_sign/imo)를 포함해도 덮어쓰기 문제가 없다. Port-MIS 보강 필드는 제외.
 * ※ 실 AIS 수집(ingest)은 이걸 쓰지 않는다 — 아래 shipToPositionRow/staticInfoToRow로 분리.
 */
export function shipToRow(
  s: Ship
): Omit<ShipRow, "previous_port" | "next_port" | "berth_name" | "gross_tonnage" | "crew_count" | "agent_company"> {
  return {
    ...shipToPositionRow(s),
    call_sign: s.callSign ?? null,
    imo: s.imo ?? null,
  };
}

// AIS 수집의 위치 flush 전용 row. 위치/상태만 담고 식별 필드(call_sign/imo)는 **절대 넣지 않는다** —
// 정적데이터(ShipStaticData)는 위치보고보다 드물게 오므로, 위치 flush가 call_sign/imo를 함께 쓰면
// 캐시가 빈 재시작 직후 매 위치보고마다 기존 호출부호/IMO를 null로 덮어써서 매칭률을 깎는다.
// 식별 필드는 staticInfoToRow로 별도 update만 한다.
export function shipToPositionRow(
  s: Ship
): Pick<ShipRow, "mmsi" | "name" | "lat" | "lon" | "sog" | "cog" | "eta" | "status" | "destination_berth_id"> {
  return {
    mmsi: s.mmsi,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    sog: s.sog,
    cog: s.cog,
    eta: s.eta,
    status: s.status,
    destination_berth_id: s.destinationBerthId ?? null,
  };
}

// ShipStaticData → 식별 필드 update용 부분 row. 값이 있는 필드만 담아(빈 값 제외) 기존 데이터를
// 절대 null로 덮어쓰지 않는다. 각 mmsi에 대해 update(...).eq("mmsi", …)로 개별 반영한다.
export function staticInfoToRow(info: StaticInfo): Partial<Pick<ShipRow, "name" | "call_sign" | "imo">> {
  const row: Partial<Pick<ShipRow, "name" | "call_sign" | "imo">> = {};
  const name = info.name?.trim();
  const callSign = info.callSign?.trim();
  if (name) row.name = name;
  if (callSign) row.call_sign = callSign;
  if (info.imo) row.imo = info.imo;
  return row;
}

// ships 테이블은 upsert만 하고 지우지 않는다 — 배가 부산항 권역을 떠나거나 AIS 신호가
// 끊겨도 마지막 위치가 그대로 남는다. (신선도 필터는 제거됨 — 갱신 시각과 무관하게 DB에
// 있는 선박을 모두 반환한다. 오래된 마지막 위치도 표시된다는 점에 유의.)

/**
 * 현재 선박 목록을 반환한다.
 * DB가 설정돼 있으면 DB의 모든 선박을, 아니면(미설정·오류·빈 테이블) 목업에서 읽는다.
 */
export async function fetchShips(): Promise<Ship[]> {
  const db = getSupabase();
  if (!db) return MOCK_SHIPS;

  const { data, error } = await db.from("ships").select("*");
  if (error) {
    console.error("[ship-source] Supabase 조회 실패, 목업으로 폴백:", error.message);
    return MOCK_SHIPS;
  }
  if (!data || data.length === 0) return MOCK_SHIPS;

  return (data as ShipRow[]).map(rowToShip);
}
