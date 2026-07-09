// 공공데이터포털 "해양수산부 국립해양조사원_국가해양관측망 실측 파랑" 클라이언트.
// 서비스 키 또는 관측소 코드가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   KHOA_API_KEY — 공공데이터포털 일반 인증키(Decoding)
//   (tide.ts · current.ts · operationIndex.ts 와 공용 — 같은 기관 발급 키)
// 관측소 코드:
//   backend/ports/seed-port.ts 의 marineStations.khoaWaveStationId (부산 = "TW_0062" 해운대해수욕장,
//   실측 확인 완료 2026-07-09 — 부산 항계 안쪽 전용 파고관측소는 없어 가장 가까운 부산 소재 지점 사용)
//
// 요청 주소(실측 확인 완료, 2026-07-09):
//   https://apis.data.go.kr/1192136/noonWave/GetNoonWaveApiService
//   조위 API(tide.ts)와 동일 패턴: 필수 파라미터는 camelCase(serviceKey, obsCode, date, resultType),
//   resultType=json 을 줘도 실제 응답은 XML, numOfRows 300 초과 시 INVALID_REQUEST_PARAMETER_ERROR.
//   관측 간격은 5분 — 하루치 조회 시 최대 288건, 당일 누적분만 내려온다(totalCount로 확인 가능).

import { XMLParser } from "fast-xml-parser";
import { BUSAN_PORT } from "../ports/seed-port";
import type { WaveObservation } from "./types";

const ENDPOINT = "https://apis.data.go.kr/1192136/noonWave/GetNoonWaveApiService";
const MAX_ROWS_PER_PAGE = 300; // 실측 확인된 상한(2026-07-09) — tide.ts 와 동일 게이트웨이 제약

interface RawWaveItem {
  obsvtrNm?: string;
  obsrvnDt: string; // "YYYY-MM-DD HH:mm" (KST)
  wvhgt: string | number; // 유의파고(m)
  wvpd?: string | number; // 파주기(s)
  wvdrct?: string | number; // 파향(deg)
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
 * 부산 인근 국가해양관측망 관측소의 당일 최신 실측 파고를 조회한다.
 * 키/관측소 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchWaveObservation(): Promise<WaveObservation | null> {
  const key = process.env.KHOA_API_KEY;
  const stationId = BUSAN_PORT.marineStations.khoaWaveStationId;
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
    throw new Error(`파랑 API 오류(${header.resultCode}): ${header.resultMsg ?? "알 수 없음"}`);
  }

  const rawItems = parsed?.response?.body?.items?.item;
  if (!rawItems) return null;
  const items: RawWaveItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];
  const latest = items[items.length - 1];
  if (!latest) return null;

  return {
    time: kstToIso(latest.obsrvnDt),
    stationId,
    waveHeightM: Number(latest.wvhgt),
    ...(latest.wvpd != null ? { wavePeriodS: Number(latest.wvpd) } : {}),
    ...(latest.wvdrct != null ? { waveDeg: Number(latest.wvdrct) } : {}),
    source: `국립해양조사원 국가해양관측망 실측 파랑(noonWave, ${latest.obsvtrNm ?? stationId})`,
  };
}
