// 선박 데이터 소스 — DB(Supabase)에서 읽고, 미설정/오류/빈 테이블이면 목업으로 폴백한다.
// 이 파일이 Ship[] 타입만 지키면 prediction/advisor/frontend 는 수정할 필요가 없다.

import type { Ship } from "../ports/port-types";
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
    ...(r.previous_port ? { previousPort: r.previous_port } : {}),
    ...(r.next_port ? { nextPort: r.next_port } : {}),
    ...(r.berth_name ? { berthName: r.berth_name } : {}),
    ...(r.gross_tonnage != null ? { grossTonnage: r.gross_tonnage } : {}),
    ...(r.crew_count != null ? { crewCount: r.crew_count } : {}),
    ...(r.agent_company ? { agentCompany: r.agent_company } : {}),
  };
}

/**
 * Ship → DB row (seed/insert 용). 위치·상태 등 AIS 소스 필드만 채운다 — Port-MIS 보강
 * 필드(previous_port 등)는 절대 포함하지 않는다. AIS 수집은 10초마다 upsert하는데,
 * 여기 보강 필드를 포함시키면 그때마다 null로 덮어써서 backend/portmis/run-enrich.ts가
 * 채운 값이 곧바로 지워진다. 보강 필드는 run-enrich.ts가 별도 update로만 채운다.
 */
export function shipToRow(
  s: Ship
): Omit<ShipRow, "previous_port" | "next_port" | "berth_name" | "gross_tonnage" | "crew_count" | "agent_company"> {
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
    call_sign: s.callSign ?? null,
  };
}

// ships 테이블은 upsert만 하고 지우지 않는다 — 배가 부산항 권역을 떠나거나 AIS 신호가
// 끊겨도 마지막 위치가 그대로 남는다. AIS(Class A 기준)는 정박 중에도 최소 몇 분 간격으로
// 재송신하므로, 이 시간 넘게 갱신이 없으면 더 이상 근처에 없는 배로 보고 제외한다.
const STALE_THRESHOLD_MINUTES = 20;

/**
 * 현재 선박 목록을 반환한다.
 * DB가 설정돼 있고 최근(STALE_THRESHOLD_MINUTES 이내) 갱신된 데이터가 있으면 DB에서,
 * 아니면(미설정·오류·전부 오래됨) 목업에서 읽는다.
 */
export async function fetchShips(): Promise<Ship[]> {
  const db = getSupabase();
  if (!db) return MOCK_SHIPS;

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60_000).toISOString();
  const { data, error } = await db.from("ships").select("*").gte("updated_at", cutoff);
  if (error) {
    console.error("[ship-source] Supabase 조회 실패, 목업으로 폴백:", error.message);
    return MOCK_SHIPS;
  }
  if (!data || data.length === 0) return MOCK_SHIPS;

  return (data as ShipRow[]).map(rowToShip);
}
