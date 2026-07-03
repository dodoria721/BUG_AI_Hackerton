// aisstream.io를 구독해 부산항 인근 선박만 Supabase ships 테이블에 채워 넣는 수집 스크립트.
//
// aisstream은 REST가 아니라 WebSocket 스트림이라 요청-응답 API route로 만들 수 없다.
// 그래서 이 스크립트를 별도 프로세스로 계속 띄워두는 구조로 뒀다 — 수집(이 파일)과
// 조회(backend/ais/ship-source.ts, /api/ships)를 분리하면 조회 쪽은 실 AIS든 목업이든
// DB만 보면 되고 수정할 필요가 없다.
//
// 부산항 필터링은 두 단계다:
//   1) 지리적 필터(주) — seed-port.ts의 부산항 중심 좌표 기준 bounding box로 구독 자체를
//      제한한다. 이 범위 안의 배는 정의상 부산에 입항/정박/출항 중인 배다.
//   2) 목적지 텍스트(부가) — ShipStaticData.Destination이 있는데 부산이 아니라고 명시된
//      배(예: 근해를 그냥 지나가는 배)는 한 번 더 걸러낸다. 목적지가 아직 없으면(=판단
//      불가) 지리적 필터만으로 통과시킨다.
//
// 실행: npm run ingest:ais
// (Node 20.6+ 필요 — package.json의 --env-file 로 .env.local을 읽는다)

import { getSupabase } from "../db/supabase";
import { BUSAN_PORT } from "../ports/seed-port";
import type { Ship } from "../ports/port-types";
import { boundingBoxAround, isBusanDestination } from "./busan-filter";
import { subscribeAisStream } from "./aisstream-client";
import { positionReportToShip, type StaticInfo } from "./normalize";
import { shipToRow } from "./ship-source";

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

// MMSI별 최신 ShipStaticData(이름·목적지) 캐시 — PositionReport에는 목적지가 안 실려온다.
const staticInfoByMmsi = new Map<string, StaticInfo>();
// 다음 flush까지 모아둘 변경분. MMSI당 최신 값만 남기면 되므로 Map이면 충분하다.
const pendingShips = new Map<string, Ship>();

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
      staticInfoByMmsi.set(mmsi, { name: s.Name, callSign: s.CallSign, destination: s.Destination });
      return;
    }

    if (msg.Message.PositionReport) {
      const staticInfo = staticInfoByMmsi.get(mmsi);

      // 목적지가 방송됐는데 부산이 아니면 제외 — 없으면(판단 불가) bbox 필터만으로 통과.
      if (staticInfo?.destination && !isBusanDestination(staticInfo.destination)) return;

      const ship = positionReportToShip(mmsi, msg.MetaData.ShipName, msg.Message.PositionReport, staticInfo);
      pendingShips.set(mmsi, ship);
    }
  },
});

async function flush() {
  if (pendingShips.size === 0) return;
  const rows = [...pendingShips.values()].map(shipToRow);
  pendingShips.clear();

  try {
    const { error } = await supabase!.from("ships").upsert(rows, { onConflict: "mmsi" });
    if (error) console.error("[ingest-aisstream] upsert 실패:", error.message);
    else console.log(`[ingest-aisstream] ${rows.length}척 갱신`);
  } catch (err) {
    // 네트워크 예외 등으로 upsert 자체가 throw해도 setInterval 루프는 계속 돌아야 한다.
    console.error("[ingest-aisstream] upsert 예외:", err);
  }
}

setInterval(flush, FLUSH_INTERVAL_MS);
