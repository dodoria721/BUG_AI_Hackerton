// 기상청 태풍정보 조회서비스(공공데이터포털) 클라이언트 — 위험 알림용.
// 서비스 키가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   KMA_TYPHOON_KEY — 공공데이터포털 "기상청_태풍정보" 활용신청(별도 승인) 후 일반 인증키(Decoding)
//
// 요청 주소(실측 확인 완료, 2026-07-09):
//   https://apis.data.go.kr/1360000/TyphoonInfoService/getTyphoonInfo
//   필수 파라미터: serviceKey, dataType, fromTmFc, toTmFc(둘 다 "YYYYMMDDHHmm", KST).
//   ⚠️ 조회 가능 기간이 "오늘 기준 3일 전까지"로 제한된다(그 밖의 범위는 resultCode=99 안내 메시지로 거절).
//   범위 안의 날짜를 넣어도 그 기간에 태풍이 없으면 정상 응답 대신 resultCode="02"(DB_ERROR)를
//   반환한다(실측 확인 완료 — 2026-07-09 기준 활성 태풍 없음, 여러 날짜/파라미터 조합으로 재현됨).
//   그래서 이 클라이언트는 02를 "이 기간 태풍 없음"으로 간주해 빈 배열을 반환한다(에러 아님).
//
// TODO(응답 스키마 미검증): 태풍이 실제로 존재하는 기간을 확보하지 못해 item 필드명은
// 기상청 태풍정보 API의 통상적인 필드(typSeq/typEn/tmFc/tmSeq/lat/lon/dir/sp/ps/ws)를
// 근거로 최선 매핑했다. 실제 태풍 발생 시 한 번 호출해 필드명을 대조 검증해야 한다.

import type { TyphoonInfo, TyphoonTrackPoint } from "./types";

const ENDPOINT = "https://apis.data.go.kr/1360000/TyphoonInfoService/getTyphoonInfo";

interface RawTyphoonItem {
  typSeq: string; // 태풍 일련번호(예: "2508")
  typEn?: string; // 영문 명칭
  typKor?: string; // 한글 명칭(있을 때만)
  tmFc: string; // 발표시각 "YYYYMMDDHHmm"(KST)
  tmSeq?: string | number; // 예보 순번 — 0=실황, 1 이상=예보
  lat: string | number;
  lon: string | number;
  ps?: string | number; // 중심기압(hPa)
  ws?: string | number; // 최대풍속(m/s)
}

/** "YYYYMMDDHHmm"(KST) → ISO 8601(UTC) */
function tmFcToIso(tmFc: string): string {
  const y = Number(tmFc.slice(0, 4));
  const m = Number(tmFc.slice(4, 6));
  const d = Number(tmFc.slice(6, 8));
  const hh = Number(tmFc.slice(8, 10));
  const mi = Number(tmFc.slice(10, 12));
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mi)).toISOString();
}

/** KST 기준 "지금"과 "3일 전"을 "YYYYMMDDHHmm" 로 반환한다(API 조회 가능 범위). */
function kstQueryRange(): { fromTmFc: string; toTmFc: string } {
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const fromKst = new Date(nowKst.getTime() - 3 * 24 * 3600 * 1000);
  const fmt = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}${m}${day}${hh}${mi}`;
  };
  return { fromTmFc: fmt(fromKst), toTmFc: fmt(nowKst) };
}

function groupByTyphoon(items: RawTyphoonItem[]): TyphoonInfo[] {
  const byTypSeq = new Map<string, RawTyphoonItem[]>();
  for (const item of items) {
    const list = byTypSeq.get(item.typSeq) ?? [];
    list.push(item);
    byTypSeq.set(item.typSeq, list);
  }

  return [...byTypSeq.entries()].map(([typSeq, rows]) => {
    const track: TyphoonTrackPoint[] = rows
      .map((row) => ({
        time: tmFcToIso(row.tmFc),
        lat: Number(row.lat),
        lon: Number(row.lon),
        ...(row.ps != null ? { centralPressureHpa: Number(row.ps) } : {}),
        ...(row.ws != null ? { maxWindSpeedMs: Number(row.ws) } : {}),
        forecast: Number(row.tmSeq ?? 0) !== 0,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    return {
      typhoonId: typSeq,
      name: rows[0]?.typEn ?? typSeq,
      ...(rows[0]?.typKor ? { nameKr: rows[0].typKor } : {}),
      status: track.some((point) => !point.forecast) ? "발생" : "예보",
      track,
      source: "기상청 태풍정보 조회서비스(getTyphoonInfo)",
    } satisfies TyphoonInfo;
  });
}

/**
 * 최근 3일 이내 발표된 태풍 정보를 조회한다(API 제약상 그 이전 기간은 조회 불가).
 * 키 미설정 시 null. 이 기간에 태풍이 없으면 빈 배열(에러 아님). API 오류 시 예외를 던진다.
 */
export async function fetchActiveTyphoons(): Promise<TyphoonInfo[] | null> {
  const key = process.env.KMA_TYPHOON_KEY;
  if (!key) return null;

  const { fromTmFc, toTmFc } = kstQueryRange();
  const params = new URLSearchParams({
    serviceKey: key,
    dataType: "JSON",
    fromTmFc,
    toTmFc,
    pageNo: "1",
    numOfRows: "300",
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`태풍정보 응답을 해석할 수 없습니다: ${text.slice(0, 200)}`);
  }

  const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })?.response
    ?.header;
  if (header?.resultCode === "02") return []; // 실측 확인: 조회 기간에 태풍 없음(DB_ERROR로 응답됨)
  if (header?.resultCode && header.resultCode !== "00") {
    throw new Error(`태풍정보 API 오류(${header.resultCode}): ${header.resultMsg ?? "알 수 없음"}`);
  }

  const body = (
    json as { response?: { body?: { items?: { item?: RawTyphoonItem[] | RawTyphoonItem } } } }
  )?.response?.body;
  const rawItems = body?.items?.item;
  if (!rawItems) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return groupByTyphoon(items);
}
