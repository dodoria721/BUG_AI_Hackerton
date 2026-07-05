// aisstream.io를 구독해 부산항 인근 선박만 Supabase ships 테이블에 채워 넣는 수집 스크립트.
//
// aisstream은 REST가 아니라 WebSocket 스트림이라 요청-응답 API route로 만들 수 없다.
// 그래서 이 스크립트를 별도 프로세스로 계속 띄워두는 구조로 뒀다 — 수집(이 파일)과
// 조회(backend/ais/ship-source.ts, /api/ships)를 분리하면 조회 쪽은 실 AIS든 목업이든
// DB만 보면 되고 수정할 필요가 없다.
//
// 부산항 필터링은 지리적 필터(bounding box) 하나만 쓴다:
//   seed-port.ts의 부산항 중심 좌표 기준 bounding box로 구독 자체를 제한한다. 이 범위 안의
//   배는 정의상 부산에 입항/정박/출항 중인 배다.
//   (목적지 텍스트 보조 필터는 제거했다 — AIS엔 출발지 필드가 없어 목적지 하나만으론 '부산발'과
//    '단순 통과'를 구분할 수 없고, 목적지만으로 제외하면 부산에서 막 출항한 배까지 놓친다.)
//
// 실행: npm run ingest:ais
// (Node 20.6+ 필요 — package.json의 --env-file 로 .env.local을 읽는다)

import { getSupabase } from "../db/supabase";
import { BUSAN_PORT } from "../ports/seed-port";
import type { Ship } from "../ports/port-types";
import { boundingBoxAround } from "./busan-filter";
import { subscribeAisStream } from "./aisstream-client";
import { positionReportToShip, type StaticInfo } from "./normalize";
import { shipToPositionRow, staticInfoToRow } from "./ship-source";

const API_KEY = process.env.AISSTREAM_API_KEY;
const FLUSH_INTERVAL_MS = 10_000;

if (!API_KEY) {
  console.error("[ingest-aisstream] AISSTREAM_API_KEY가 없습니다. .env.local에 설정하세요.");
  process.exit(1);
}

const supabase = getSupabase();
if (!supabase) {
  console.error("[ingest-aisstream] Supabase 환경변수가 없습니다. .env.local에 설정하세요.");
  process.exit(1);
}

// 장시간 켜두는 스크립트라, 예상 못 한 예외로 조용히 죽는 대신 로그를 남기고 계속 돈다.
process.on("unhandledRejection", (err) => console.error("[ingest-aisstream] unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("[ingest-aisstream] uncaughtException:", err));

// MMSI별 최신 ShipStaticData(이름·호출부호·IMO·목적지) 캐시 — 세션 내내 유지한다.
// PositionReport에는 이 값들이 안 실려오므로, 여기 모아뒀다가 정적 flush로 DB에 반영한다.
const staticInfoByMmsi = new Map<string, StaticInfo>();
// 다음 위치 flush까지 모아둘 위치 변경분. MMSI당 최신 값만 남기면 되므로 Map이면 충분하다.
const pendingShips = new Map<string, Ship>();
// 아직 DB 행에 반영 못 한 정적데이터 MMSI. 정적 flush에서 update가 성공(행 존재)하면 제거하고,
// 행이 아직 없으면(0건) 남겨서 다음 flush에 재시도한다.
const pendingStatic = new Set<string>();

const boundingBox = boundingBoxAround(BUSAN_PORT);
console.log(`[ingest-aisstream] ${BUSAN_PORT.name} bounding box 구독: ${JSON.stringify(boundingBox)}`);

subscribeAisStream({
  apiKey: API_KEY,
  boundingBoxes: [boundingBox],
  onStatus: (status, detail) => {
    if (status === "error") console.error("[ingest-aisstream] error:", detail);
    else if (status === "watchdog-reconnect") console.warn("[ingest-aisstream] watchdog 재연결:", detail);
    else console.log(`[ingest-aisstream] ${status}`);
  },
  onMessage: (msg) => {
    const mmsi = String(msg.MetaData.MMSI);

    if (msg.Message.ShipStaticData) {
      const s = msg.Message.ShipStaticData;
      // IMO 0 은 "미제공"을 뜻하므로 값으로 취급하지 않는다.
      const imo = s.ImoNumber && s.ImoNumber > 0 ? String(s.ImoNumber) : undefined;
      staticInfoByMmsi.set(mmsi, { name: s.Name, callSign: s.CallSign, destination: s.Destination, imo });
      pendingStatic.add(mmsi); // 다음 정적 flush에서 이 배의 식별 필드를 DB에 반영
      return;
    }

    if (msg.Message.PositionReport) {
      const staticInfo = staticInfoByMmsi.get(mmsi);

      // 부산 인근 bbox 안이면 유지한다. AIS엔 출발지(origin) 필드가 없어 목적지 하나만으론
      // '부산발(목적지=비부산)'과 '단순 통과'를 구분할 수 없다 — 목적지·출발지 둘 다 확인해야
      // 통과 선박이라 단정할 수 있는데 출발지가 없으므로, 목적지 단독으로는 제외하지 않는다.
      const ship = positionReportToShip(mmsi, msg.MetaData.ShipName, msg.Message.PositionReport, staticInfo);
      pendingShips.set(mmsi, ship);
    }
  },
});

// 위치 flush — 위치/상태 컬럼만 upsert한다(식별 필드는 건드리지 않음).
async function flushPositions() {
  if (pendingShips.size === 0) return;
  const rows = [...pendingShips.values()].map(shipToPositionRow);
  pendingShips.clear();

  try {
    const { error } = await supabase!.from("ships").upsert(rows, { onConflict: "mmsi" });
    if (error) console.error("[ingest-aisstream] 위치 upsert 실패:", error.message);
    else console.log(`[ingest-aisstream] 위치 ${rows.length}척 갱신`);
  } catch (err) {
    // 네트워크 예외 등으로 upsert 자체가 throw해도 setInterval 루프는 계속 돌아야 한다.
    console.error("[ingest-aisstream] 위치 upsert 예외:", err);
  }
}

// 정적 flush — 식별 필드(name/call_sign/imo)를 mmsi별 update로만 반영한다.
// upsert가 아니라 update라 위치보고가 만든 기존 행에만 붙고, 위치 컬럼을 절대 건드리지 않는다.
// 행이 아직 없으면(신규 mmsi가 정적을 먼저 보냄) 0건 → pendingStatic에 남겨 다음 flush에 재시도.
async function flushStatic() {
  if (pendingStatic.size === 0) return;
  let updated = 0;
  for (const mmsi of [...pendingStatic]) {
    const info = staticInfoByMmsi.get(mmsi);
    const row = info ? staticInfoToRow(info) : {};
    if (Object.keys(row).length === 0) {
      pendingStatic.delete(mmsi); // 반영할 값이 없으면 재시도할 이유도 없다
      continue;
    }
    try {
      const { data, error } = await supabase!.from("ships").update(row).eq("mmsi", mmsi).select("mmsi");
      if (error) {
        console.error("[ingest-aisstream] 정적 update 실패:", mmsi, error.message);
        continue; // 다음 flush에 재시도 (pendingStatic 유지)
      }
      if (data && data.length > 0) {
        pendingStatic.delete(mmsi); // 행에 반영됨
        updated++;
      }
      // data.length === 0 → 아직 위치 행이 없음 → pendingStatic 유지(재시도)
    } catch (err) {
      console.error("[ingest-aisstream] 정적 update 예외:", mmsi, err);
    }
  }
  if (updated > 0) console.log(`[ingest-aisstream] 식별정보 ${updated}척 반영 (대기 ${pendingStatic.size})`);
}

// 위치를 먼저 반영해 행을 만든 뒤, 정적 update가 그 행에 붙도록 순서대로 실행한다.
setInterval(() => {
  void flushPositions().then(flushStatic);
}, FLUSH_INTERVAL_MS);
