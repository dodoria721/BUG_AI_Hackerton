// 공공데이터포털 "국립해양조사원_조위관측소 실측·예측 조위 조회" 클라이언트.
// 서비스 키 또는 관측소 코드가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   KHOA_API_KEY — 공공데이터포털 일반 인증키(Decoding)
//   (wave.ts · current.ts · operationIndex.ts 와 공용 — 같은 기관 발급 키)
// 관측소 코드:
//   backend/ports/seed-port.ts 의 marineStations.khoaTideStationId (부산 = "DT_0005", 실측 확인 완료)
//
// 요청 주소(실측 확인 완료, 2026-07-09):
//   https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService
//   필수 파라미터는 camelCase(serviceKey, obsCode, date, resultType) — data.go.kr 상세페이지에
//   나온 PascalCase(ServiceKey/ObsCode/Date/ResultType) 표기와 다르니 주의.
//   응답은 resultType=json 을 줘도 실제로는 XML(<type>xml</type>)로 온다 — fast-xml-parser로 파싱.
//   한 번의 호출로 하루치(YYYY-MM-DD 00:00~23:59, 1분 간격) 실측(tdlvHgt)·기준/예측(bscTdlvHgt)
//   조위가 함께 내려온다.

import { XMLParser } from "fast-xml-parser";
import { BUSAN_PORT } from "../ports/seed-port";
import type { TideLevelPoint, TideObservation, TidePrediction } from "./types";

const ENDPOINT = "https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService";
// numOfRows 상한 확인됨(실측, 2026-07-09): 300은 통과, 350부터 INVALID_REQUEST_PARAMETER_ERROR.
// 하루(1440분) 전체 대신 최근 5시간(300분)만 가져온다 — 필요하면 pageNo로 이어붙일 수 있다.
const MAX_ROWS_PER_PAGE = 300;

interface RawTideItem {
  obsvtrNm?: string;
  obsrvnDt: string; // "YYYY-MM-DD HH:mm" (KST)
  bscTdlvHgt: string | number; // 기준(예측) 조위(cm)
  tdlvHgt: string | number; // 실측 조위(cm)
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

async function fetchSurveyTideItems(params: {
  key: string;
  stationId: string;
  date: string;
}): Promise<{ stationName?: string; items: RawTideItem[] } | null> {
  const query = new URLSearchParams({
    serviceKey: params.key,
    obsCode: params.stationId,
    date: params.date,
    resultType: "json",
    numOfRows: String(MAX_ROWS_PER_PAGE),
    pageNo: "1",
  });

  const res = await fetch(`${ENDPOINT}?${query.toString()}`, { cache: "no-store" });
  const text = await res.text();
  const parsed = new XMLParser().parse(text);
  const header = parsed?.response?.header;
  if (header && header.resultCode !== "00" && header.resultCode !== 0) {
    throw new Error(`조위 API 오류(${header.resultCode}): ${header.resultMsg ?? "알 수 없음"}`);
  }

  const rawItems = parsed?.response?.body?.items?.item;
  if (!rawItems) return { items: [] };
  const items: RawTideItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];
  return { stationName: items[0]?.obsvtrNm, items };
}

function hasCreds(): { key: string; stationId: string } | null {
  const key = process.env.KHOA_API_KEY;
  const stationId = BUSAN_PORT.marineStations.khoaTideStationId;
  if (!key || !stationId) return null;
  return { key, stationId };
}

/**
 * 부산항 인근 조위관측소의 실측 조위 시계열(오늘 하루, 1분 간격)을 조회한다.
 * 키/관측소 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchTideObservation(): Promise<TideObservation | null> {
  const creds = hasCreds();
  if (!creds) return null;

  const result = await fetchSurveyTideItems({ ...creds, date: kstTodayYyyymmdd() });
  if (!result) return null;

  const points: TideLevelPoint[] = result.items.map((item) => ({
    time: kstToIso(item.obsrvnDt),
    levelCm: Number(item.tdlvHgt),
  }));

  return {
    stationId: creds.stationId,
    stationName: result.stationName,
    points,
    source: "국립해양조사원 조위관측소 실측 조위(surveyTideLevel)",
  };
}

/**
 * 부산항 인근 조위관측소의 기준(예측) 조위 시계열(오늘 하루, 1분 간격)을 조회한다.
 * 키/관측소 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchTidePrediction(): Promise<TidePrediction | null> {
  const creds = hasCreds();
  if (!creds) return null;

  const result = await fetchSurveyTideItems({ ...creds, date: kstTodayYyyymmdd() });
  if (!result) return null;

  const points: TideLevelPoint[] = result.items.map((item) => ({
    time: kstToIso(item.obsrvnDt),
    levelCm: Number(item.bscTdlvHgt),
  }));

  return {
    stationId: creds.stationId,
    stationName: result.stationName,
    points,
    source: "국립해양조사원 조위관측소 기준(예측) 조위(surveyTideLevel)",
  };
}
