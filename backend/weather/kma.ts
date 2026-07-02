// 기상청 단기예보 조회서비스(VilageFcstInfoService_2.0/getVilageFcst) 클라이언트.
// 서비스 키가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   KMA_SERVICE_KEY — 공공데이터포털 "일반 인증키(Decoding)" 값
//                     (Encoding 키를 넣으면 이중 인코딩되니 반드시 Decoding 키)

import { BUSAN_PORT } from "../ports/seed-port";
import { latLonToGrid } from "./grid";
import type { WeatherForecast, WeatherPoint } from "./types";

const ENDPOINT =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

// 단기예보 발표 시각(정시). 발표 후 약 10분 뒤 제공된다.
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

/** KST 기준 현재 시각(필드는 getUTC* 로 읽는다). */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 현재 시각 기준 가장 최근 발표(base_date/base_time)를 계산한다. */
function latestBase(now = kstNow()): { baseDate: string; baseTime: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // 발표 +10분 이후에 제공되므로 그 시점을 지난 가장 늦은 슬롯을 고른다.
  let slot = -1;
  for (const h of BASE_HOURS) {
    if (minutes >= h * 60 + 10) slot = h;
  }

  if (slot === -1) {
    // 오늘 02:10 이전 → 전날 2300 발표 사용
    const prev = new Date(Date.UTC(y, m, d - 1));
    return {
      baseDate: `${prev.getUTCFullYear()}${pad2(prev.getUTCMonth() + 1)}${pad2(prev.getUTCDate())}`,
      baseTime: "2300",
    };
  }
  return { baseDate: `${y}${pad2(m + 1)}${pad2(d)}`, baseTime: `${pad2(slot)}00` };
}

interface KmaItem {
  baseDate: string;
  baseTime: string;
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx: number;
  ny: number;
}

/** "YYYYMMDD" + "HHMM"(KST) → ISO 8601 (UTC) */
function toIso(fcstDate: string, fcstTime: string): string {
  const yy = Number(fcstDate.slice(0, 4));
  const mm = Number(fcstDate.slice(4, 6));
  const dd = Number(fcstDate.slice(6, 8));
  const hh = Number(fcstTime.slice(0, 2));
  const mi = Number(fcstTime.slice(2, 4));
  // KST(=UTC+9) 시각이므로 9시간 빼서 UTC 로 변환
  return new Date(Date.UTC(yy, mm - 1, dd, hh - 9, mi)).toISOString();
}

/** 카테고리 코드를 WeatherPoint 필드에 채워 넣는다. */
function applyCategory(point: WeatherPoint, category: string, raw: string): void {
  const num = Number(raw);
  switch (category) {
    case "TMP":
      point.tempC = num;
      break;
    case "SKY":
      point.sky = num;
      break;
    case "PTY":
      point.pty = num;
      break;
    case "POP":
      point.pop = num;
      break;
    case "PCP":
      point.precip = raw;
      break;
    case "REH":
      point.humidity = num;
      break;
    case "WSD":
      point.windSpeed = num;
      break;
    case "VEC":
      point.windDeg = num;
      break;
    case "WAV":
      point.waveM = num;
      break;
  }
}

/**
 * 부산항 좌표의 단기예보를 조회해 시간순 WeatherForecast 로 반환한다.
 * 키 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchShortTermForecast(): Promise<WeatherForecast | null> {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) return null;

  const grid = latLonToGrid(BUSAN_PORT.center);
  const { baseDate, baseTime } = latestBase();

  const params = new URLSearchParams({
    serviceKey: key, // Decoding 키 → URLSearchParams 가 한 번 인코딩
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // 키 오류 등에서는 XML 에러가 온다.
    throw new Error(`기상청 응답을 해석할 수 없습니다: ${text.slice(0, 200)}`);
  }

  const body = (json as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: KmaItem[] } } } }).response;
  const code = body?.header?.resultCode;
  if (code !== "00") {
    throw new Error(`기상청 오류(${code}): ${body?.header?.resultMsg ?? "알 수 없음"}`);
  }

  const items = body?.body?.items?.item ?? [];

  // fcstDate+fcstTime 별로 묶어 WeatherPoint 생성
  const byTime = new Map<string, WeatherPoint>();
  for (const it of items) {
    const iso = toIso(it.fcstDate, it.fcstTime);
    let point = byTime.get(iso);
    if (!point) {
      point = { time: iso };
      byTime.set(iso, point);
    }
    applyCategory(point, it.category, it.fcstValue);
  }

  const points = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));

  return {
    port: BUSAN_PORT.name,
    baseTime: toIso(baseDate, baseTime),
    grid,
    points,
  };
}
