// 공공데이터포털 "해양수산부 국립해양조사원_조류예보(시계열)" 클라이언트 — 5단계 "추가하면 좋은 것" 항목.
// 서비스 키 또는 관측소 코드가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   KHOA_API_KEY — 공공데이터포털 일반 인증키(Decoding)
//   (wave.ts · tide.ts · operationIndex.ts 와 공용 — 같은 기관 발급 키)
// 관측소 코드:
//   backend/ports/seed-port.ts 의 marineStations.khoaCurrentStationId (부산 = "16LTC13" 부산항입구,
//   실측 확인 완료 2026-07-09 — 조위/파랑과 코드 체계가 전혀 다름, "DT_"/"TW_" 아님)
//
// 요청 주소(실측 확인 완료, 2026-07-09):
//   https://apis.data.go.kr/1192136/crntFcstTime/GetCrntFcstTimeApiService
//   tide.ts/wave.ts와 동일 패턴: camelCase(serviceKey, obsCode, date, resultType), 응답은
//   resultType=json 을 줘도 XML(응답 안의 <type>json</type>은 "요청한 타입"을 되돌려줄 뿐 실제
//   포맷이 아니다 — 파싱하다 처음에 이걸로 헷갈려서 XMLParser로 다시 고쳤다).
//   numOfRows 300 초과 시 INVALID_REQUEST_PARAMETER_ERROR. 1분 간격, 하루 최대 1440건 중 페이지당 300건.
//   유향(crdir)은 각도가 아니라 16방위 한글 문자열("북서" 등)로 온다 — 표준 16방위 각도로 변환해서 저장.
//   유속(crsp)의 단위는 문서로 명시적 확인은 못 했으나 국립해양조사원 조류표 관례상 cm/s로 보고
//   knot으로 환산한다(1kn = 51.4444cm/s) — TODO: 실측치로 재검증 필요.

import { XMLParser } from "fast-xml-parser";
import { BUSAN_PORT } from "../ports/seed-port";
import type { TidalCurrentForecast, TidalCurrentPoint } from "./types";

const ENDPOINT = "https://apis.data.go.kr/1192136/crntFcstTime/GetCrntFcstTimeApiService";
const MAX_ROWS_PER_PAGE = 300; // 실측 확인된 상한(2026-07-09) — tide.ts/wave.ts 와 동일 게이트웨이 제약
const CM_PER_S_PER_KNOT = 51.4444;

// 16방위(한글) → 각도(deg). 국립해양조사원 조류예보 crdir 필드가 이 표기를 쓴다.
const COMPASS_16_TO_DEG: Record<string, number> = {
  북: 0,
  북북동: 22.5,
  북동: 45,
  동북동: 67.5,
  동: 90,
  동남동: 112.5,
  남동: 135,
  남남동: 157.5,
  남: 180,
  남남서: 202.5,
  남서: 225,
  서남서: 247.5,
  서: 270,
  서북서: 292.5,
  북서: 315,
  북북서: 337.5,
};

interface RawCurrentItem {
  obsvtrNm?: string;
  predcDt: string; // "YYYY-MM-DD HH:mm" (KST)
  crdir?: string; // 유향(16방위 한글)
  crsp?: string | number; // 유속(cm/s 추정)
}

/** "YYYY-MM-DD HH:mm"(KST) → ISO 8601(UTC) */
function kstToIso(kst: string): string {
  const [datePart, timePart] = kst.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mi] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mi)).toISOString();
}

/** KST 기준 오늘 날짜를 "YYYYMMDD" 로 반환한다. */
function kstTodayYyyymmdd(): string {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * 부산항 인근 지점의 조류예보 시계열(유속·유향)을 조회한다.
 * 키/지점 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchTidalCurrentForecast(): Promise<TidalCurrentForecast | null> {
  const key = process.env.KHOA_API_KEY;
  const stationId = BUSAN_PORT.marineStations.khoaCurrentStationId;
  if (!key || !stationId) return null;

  const query = new URLSearchParams({
    serviceKey: key,
    obsCode: stationId,
    date: kstTodayYyyymmdd(),
    resultType: "json",
    numOfRows: String(MAX_ROWS_PER_PAGE),
    pageNo: "1",
  });

  const res = await fetch(`${ENDPOINT}?${query.toString()}`, { cache: "no-store" });
  const text = await res.text();
  const parsed = new XMLParser().parse(text);
  const header = parsed?.response?.header;
  if (header && header.resultCode !== "00" && header.resultCode !== 0) {
    throw new Error(`조류예보 API 오류(${header.resultCode}): ${header.resultMsg ?? "알 수 없음"}`);
  }

  const rawItems = parsed?.response?.body?.items?.item;
  if (!rawItems) return { stationId, points: [], source: "국립해양조사원 조류예보(crntFcstTime)" };
  const items: RawCurrentItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];

  const points: TidalCurrentPoint[] = items.map((item) => ({
    time: kstToIso(item.predcDt),
    ...(item.crsp != null ? { speedKn: Number(item.crsp) / CM_PER_S_PER_KNOT } : {}),
    ...(item.crdir && COMPASS_16_TO_DEG[item.crdir] != null ? { dirDeg: COMPASS_16_TO_DEG[item.crdir] } : {}),
  }));

  return {
    stationId,
    stationName: items[0]?.obsvtrNm,
    points,
    source: "국립해양조사원 조류예보(crntFcstTime)",
  };
}
