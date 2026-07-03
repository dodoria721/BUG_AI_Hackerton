// port_calls 테이블 읽기/쓰기. ships(ship-source.ts)와 같은 패턴 — DB 컬럼(snake_case) ↔
// 도메인 타입(camelCase) 매핑을 이 파일 한 곳에서만 한다.

import type { PortCall, PortCallEvent } from "../ports/port-types";
import { getSupabase } from "../db/supabase";
import { classifyBerth } from "./portcalls";

interface PortCallRow {
  call_sign: string;
  vessel_name: string;
  vessel_type: string | null;
  nationality: string | null;
  previous_port: string | null;
  next_port: string | null;
  event: string | null;
  event_time: string | null;
  berth_name: string | null;
  gross_tonnage: number | null;
}

export function portCallToRow(c: PortCall): PortCallRow {
  return {
    call_sign: c.callSign,
    vessel_name: c.vesselName,
    vessel_type: c.vesselType ?? null,
    nationality: c.nationality ?? null,
    previous_port: c.previousPort ?? null,
    next_port: c.nextPort ?? null,
    event: c.event,
    event_time: c.eventTime ?? null,
    berth_name: c.berthName ?? null,
    gross_tonnage: c.grossTonnage ?? null,
  };
}

function rowToPortCall(r: PortCallRow): PortCall {
  return {
    callSign: r.call_sign,
    vesselName: r.vessel_name,
    event: (r.event as PortCallEvent) ?? "입항",
    ...(r.vessel_type ? { vesselType: r.vessel_type } : {}),
    ...(r.nationality ? { nationality: r.nationality } : {}),
    ...(r.previous_port ? { previousPort: r.previous_port } : {}),
    ...(r.next_port ? { nextPort: r.next_port } : {}),
    ...(r.event_time ? { eventTime: new Date(r.event_time).toISOString() } : {}),
    ...(r.berth_name ? { berthName: r.berth_name, berthType: classifyBerth(r.berth_name) } : {}),
    ...(r.gross_tonnage != null ? { grossTonnage: r.gross_tonnage } : {}),
  };
}

/** port_calls 테이블 전체를 최근 신고 시각 내림차순으로 반환한다. DB 미설정/오류면 빈 배열. */
export async function fetchPortCalls(): Promise<PortCall[]> {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db
    .from("port_calls")
    .select("*")
    .order("event_time", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("[portcall-source] 조회 실패:", error.message);
    return [];
  }
  return (data as PortCallRow[] | null)?.map(rowToPortCall) ?? [];
}
