// Port-MIS(해양수산부_선박운항정보) 입출항 신고를 한 번 가져와 두 가지를 한다:
//   1) port_calls 테이블에 전수 upsert — 부산항 정박/입출항 선박 목록의 주 소스.
//   2) 현재 AIS ships와 호출부호/이름으로 매칭해 직전출항항·선석명 등을 보강.
//
// AIS(backend/ais/ingest-aisstream.ts)는 실시간 위치를 주지만 aisstream 무료 커버리지가
// 희박해 신항 등 상당수 선박이 안 잡힌다. Port-MIS는 위치는 없지만 공식·전수라 서로 보완한다.
//
// 신고 데이터는 위치처럼 초 단위로 바뀌지 않으므로, 10초 폴링(ingest:ais)과 달리 이건
// 필요할 때 수동 실행하거나(1일 트래픽 상한 10,000건) 크론으로 몇 분~몇 시간 간격 실행한다.
//
// 실행: npm run enrich:portmis

import { getSupabase } from "../db/supabase";
import { fetchShips } from "../ais/ship-source";
import { fetchBusanPortMisEntries } from "./client";
import { matchEnrichment } from "./enrich";
import { toPortCall } from "./portcalls";
import { portCallToRow } from "./portcall-source";

const SERVICE_KEY = process.env.MOF_SHIP_OPERATION_KEY;
const LOOKBACK_DAYS = 2; // 입출항 신고가 확정되기까지 시차가 있을 수 있어 며칠 여유를 둔다

if (!SERVICE_KEY) {
  console.error("[enrich-portmis] MOF_SHIP_OPERATION_KEY가 없습니다. .env.local에 설정하세요.");
  process.exit(1);
}

const supabase = getSupabase();
if (!supabase) {
  console.error("[enrich-portmis] Supabase 환경변수가 없습니다. .env.local에 설정하세요.");
  process.exit(1);
}

async function main() {
  const ede = new Date();
  const sde = new Date(ede.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[enrich-portmis] Port-MIS 부산항 입출항 신고 조회: ${sde.toDateString()} ~ ${ede.toDateString()}`);
  const items = await fetchBusanPortMisEntries(SERVICE_KEY!, sde, ede);
  console.log(`[enrich-portmis] 신고 ${items.length}건 조회됨`);

  // 1) port_calls 전수 upsert. (call_sign, vessel_name) 키가 겹치는 건 한 배치에 하나만
  //    남겨야 upsert가 에러 안 난다 — 최근 신고가 뒤에 오도록 Map으로 dedup.
  const callMap = new Map<string, ReturnType<typeof portCallToRow>>();
  for (const item of items) {
    const row = portCallToRow(toPortCall(item));
    callMap.set(`${row.call_sign}|${row.vessel_name}`, row);
  }
  const callRows = [...callMap.values()];
  const { error: pcErr } = await supabase!.from("port_calls").upsert(callRows, {
    onConflict: "call_sign,vessel_name",
  });
  if (pcErr) console.error("[enrich-portmis] port_calls upsert 실패:", pcErr.message);
  else console.log(`[enrich-portmis] port_calls ${callRows.length}건 저장`);

  // 2) AIS ships 보강
  const ships = await fetchShips();
  console.log(`[enrich-portmis] 현재 선박 ${ships.length}척과 매칭 시도`);

  let matched = 0;
  for (const ship of ships) {
    const enrichment = matchEnrichment(ship, items);
    if (!enrichment) continue;

    const { error } = await supabase!
      .from("ships")
      .update({
        call_sign: enrichment.callSign ?? null,
        previous_port: enrichment.previousPort ?? null,
        next_port: enrichment.nextPort ?? null,
        berth_name: enrichment.berthName ?? null,
        gross_tonnage: enrichment.grossTonnage ?? null,
        crew_count: enrichment.crewCount ?? null,
        agent_company: enrichment.agentCompany ?? null,
      })
      .eq("mmsi", ship.mmsi);

    if (error) {
      console.error(`[enrich-portmis] ${ship.mmsi} 업데이트 실패:`, error.message);
      continue;
    }
    matched++;
  }

  console.log(`[enrich-portmis] ${matched}척 보강 완료`);
}

main().catch((err) => {
  console.error("[enrich-portmis] 실패:", err);
  process.exit(1);
});
