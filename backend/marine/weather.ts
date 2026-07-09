// 국립해양측위정보원(NMPNT) 해양기상 정보 API 클라이언트.
// 해양관측지점의 기상센서정보(최신/날짜별)를 제공한다.
// 서비스 키 또는 지점 코드가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   NMPNT_MARINE_WEATHER_KEY — 공공데이터포털 "국립해양측위정보원_해양기상 정보" 일반 인증키
// 지점 코드:
//   backend/ports/seed-port.ts 의 marineStations.nmpntOrgCode(기관코드) / nmpntStationId(지점코드)
//
// 요청 주소(매뉴얼 원문):
//   최신 기상정보: http://marineweather.nmpnt.go.kr:8001/openWeatherNow.do
//     ?serviceKey=인증키&resultType=json&mmaf=기관코드&mmsi=지점코드1,지점코드2&dataType=데이터타입
//   날짜별 기상정보: http://marineweather.nmpnt.go.kr:8001/openWeatherDate.do
//     ?serviceKey=인증키&resultType=json&date=검색기준날짜&mmaf=기관코드&mmsi=지점코드1,지점코드2&dataType=데이터타입
//
// TODO(API 연동): 매뉴얼에 응답 JSON의 정확한 필드명(온도/기압/풍향풍속 등 컬럼명)이 없어
// 아래 파싱은 자리표시다. 실제 호출 후 응답 구조를 확인해 mapItem()을 채운다.

import { BUSAN_PORT } from "../ports/seed-port";
import type { MarineWeatherObservation } from "./types";

const ENDPOINT_NOW = "http://marineweather.nmpnt.go.kr:8001/openWeatherNow.do";
const ENDPOINT_DATE = "http://marineweather.nmpnt.go.kr:8001/openWeatherDate.do";

function hasCreds(): { key: string; mmaf: string; mmsi: string } | null {
  const key = process.env.NMPNT_MARINE_WEATHER_KEY;
  const { nmpntOrgCode: mmaf, nmpntStationId: mmsi } = BUSAN_PORT.marineStations;
  if (!key || !mmaf || !mmsi) return null;
  return { key, mmaf, mmsi };
}

// TODO(API 연동): 실제 응답 아이템 타입으로 교체 — 매뉴얼에 필드 목록이 없어 unknown 으로 둔다.
function mapItem(_raw: unknown): MarineWeatherObservation {
  throw new Error("mapItem 미구현: NMPNT 응답 필드명을 확인한 뒤 MarineWeatherObservation 으로 매핑해야 한다.");
}

async function callNmpnt(url: string, extraParams: Record<string, string> = {}): Promise<unknown> {
  const creds = hasCreds();
  if (!creds) return null;

  const params = new URLSearchParams({
    serviceKey: creds.key,
    resultType: "json",
    mmaf: creds.mmaf,
    mmsi: creds.mmsi,
    dataType: "json",
    ...extraParams,
  });

  const res = await fetch(`${url}?${params.toString()}`, { cache: "no-store" });
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`NMPNT 해양기상 응답을 해석할 수 없습니다: ${text.slice(0, 200)}`);
  }
}

/**
 * 부산항 인근 관측지점의 최신 해양기상 정보를 조회한다.
 * 키/지점 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchMarineWeather(): Promise<MarineWeatherObservation | null> {
  const json = await callNmpnt(ENDPOINT_NOW);
  if (json === null) return null;
  return mapItem(json);
}

/**
 * 부산항 인근 관측지점의 특정 날짜 해양기상 정보를 조회한다. date: "YYYYMMDD".
 * 키/지점 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchMarineWeatherByDate(date: string): Promise<MarineWeatherObservation | null> {
  const json = await callNmpnt(ENDPOINT_DATE, { date });
  if (json === null) return null;
  return mapItem(json);
}
