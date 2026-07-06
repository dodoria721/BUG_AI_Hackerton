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
import { BUSAN_PORT } from "../ports/seed-port";
import { computePortCongestion } from "../prediction/congestion";
import { fetchBusanEntriesByDay, fetchBusanPortMisEntries } from "./client";
import { matchEnrichment } from "./enrich";
import { toPortCall, isCurrentlyInPort, mergeByVessel, countRecentActivity } from "./portcalls";
import { portCallToRow } from "./portcall-source";
import { savePortCongestion } from "./congestion-source";
import { savePortCallActivity, ACTIVITY_WINDOW_HOURS } from "./activity-source";

const SERVICE_KEY = process.env.MOF_SHIP_OPERATION_KEY;
// 이 기간 안에 입항해서 아직 출항 안 한 배를 "현재 정박 중"으로 본다. 하루 단위로 훑으므로
// 장기 정박선(수리·대기·벌크 등)까지 포착하려면 넉넉히 — 30일이면 사실상 전부 잡힌다.
const LOOKBACK_DAYS = 30;

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
  console.log(`[enrich-portmis] Port-MIS 부산항 최근 ${LOOKBACK_DAYS}일 입출항 신고를 하루 단위로 조회...`);
  const raw = await fetchBusanEntriesByDay(SERVICE_KEY!, LOOKBACK_DAYS);

  // 혼잡도는 미래 입항 신고(도착 전 미리 낸 것)까지 봐야 예측이 되므로, 앞으로 2일치도 더 받는다.
  const future: typeof raw = [];
  for (let d = 1; d <= 2; d++) {
    const day = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
    future.push(...(await fetchBusanPortMisEntries(SERVICE_KEY!, day, day)));
  }

  // 같은 선박이 여러 item으로 흩어져 오므로 선박 단위로 detail을 합쳐 정박 여부를 판정한다.
  const items = mergeByVessel([...raw, ...future]);
  console.log(`[enrich-portmis] 신고 ${raw.length + future.length}건 → 선박 ${items.length}척`);

  // 1) 현재 정박 중(입항 후 미출항)인 선박만 골라 port_calls를 통째로 교체한다.
  //    port_calls는 "지금 항내에 있는 배" 스냅샷이라, 지난번에 정박했다가 이미 떠난 배는
  //    남아있으면 안 된다. 그래서 upsert가 아니라 전체 삭제 후 삽입으로 스냅샷을 갈아끼운다.
  const snapshotNow = new Date();
  const inPort = items.filter((item) => isCurrentlyInPort(item, snapshotNow));
  const callMap = new Map<string, ReturnType<typeof portCallToRow>>();
  for (const item of inPort) {
    const row = portCallToRow(toPortCall(item));
    callMap.set(`${row.call_sign}|${row.vessel_name}`, row); // (call_sign, vessel_name) dedup
  }
  const callRows = [...callMap.values()];

  const { error: delErr } = await supabase!.from("port_calls").delete().not("vessel_name", "is", null);
  if (delErr) console.error("[enrich-portmis] port_calls 초기화 실패:", delErr.message);

  const { error: insErr } = await supabase!.from("port_calls").insert(callRows);
  if (insErr) console.error("[enrich-portmis] port_calls 삽입 실패:", insErr.message);
  else console.log(`[enrich-portmis] 현재 정박 중 ${callRows.length}척 저장 (선박 ${items.length}척 중)`);

  // 2) 최근 24시간 부두별 입·출항 신고 집계 — port_calls엔 출항한 배가 안 남으므로
  //    (전부 event="입항"), 지역별 입·출항 건수는 이 스냅샷에 따로 저장한다.
  const activity = countRecentActivity(items, BUSAN_PORT, snapshotNow, ACTIVITY_WINDOW_HOURS);
  let arr = 0, dep = 0;
  for (const a of activity.values()) { arr += a.arrivals; dep += a.departures; }
  console.log(`[enrich-portmis] 최근 ${ACTIVITY_WINDOW_HOURS}시간 입항 ${arr}건·출항 ${dep}건 (부두 ${activity.size}곳)`);
  const actSaved = await savePortCallActivity(activity);
  if (!actSaved.ok) console.error("[enrich-portmis] 입·출항 집계 저장 실패:", actSaved.error);

  // 3) Port-MIS 기반 혼잡도 — 모든 입항 detail의 입항시각으로 시간대별 밀도를 계산해 저장한다.
  const arrivalTimes: string[] = [];
  for (const it of items) {
    for (const d of it.details) {
      if (d.etryndNm === "입항" && d.etryptDt) arrivalTimes.push(d.etryptDt);
    }
  }
  const congestion = computePortCongestion(arrivalTimes, BUSAN_PORT, snapshotNow, {
    currentInPortCount: callRows.length,
  });
  const saved = await savePortCongestion(congestion);
  if (!saved.ok) console.error("[enrich-portmis] 혼잡도 저장 실패:", saved.error);
  else console.log(`[enrich-portmis] 혼잡도 저장 (현재 ${Math.round(congestion.currentLevel * 100)}%, ${congestion.forecast.length}구간)`);

  // 4) AIS ships 보강
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
