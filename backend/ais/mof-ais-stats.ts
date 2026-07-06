// 해양수산부 "선박위치정보(연안AIS) 통계정보" WFS 어댑터.
// data.go.kr 15084033 → 실제 제공은 gicoms.go.kr WFS(GeoServer) 이며, 개별 선박 위치가 아니라
// "해양 격자 구역 × 시간대(0~23시)별 선박 척수(ais)" 집계를 GeoJSON으로 준다. 따라서 지도/ETA용이
// 아니라 **혼잡도 보조 소스**로 쓴다 — 부산항 bbox 안 격자들의 ais를 시간대별로 합산해 시간당
// 재항/통항 척수 시계열을 만든다.
//
// ⚠️ 척수 규모 주의: 이 통계는 부산항 입출항 신고(Port-MIS, 수백 척)와 달리 해역 내 모든 AIS
// 송신 선박(소형선·통항선 포함)을 세므로 시간당 ~1000 규모로 훨씬 크다. 혼잡도 정규화 시
// portCallCapacity 밴드를 그대로 쓰면 안 되고, 이 소스 전용 기준으로 상대비교해야 한다.
//
// 인증: 요청에 key(발급 인증키) + domain(발급 시 등록한 호스트)이 모두 필요하다. domain은
// 스킴(https://)·끝슬래시 없이 호스트만 넣어야 통과한다(그 외 표기는 INVALID_DOMAIN).
// 비밀 값은 .env.local 에만 둔다: MOF_AIS_API_KEY, MOF_AIS_DOMAIN.

import { BUSAN_PORT } from "../ports/seed-port";
import { boundingBoxAround, type BoundingBox } from "./busan-filter";

const WFS_ENDPOINT = "https://gicoms.go.kr/kodispub/openApi/wfs.do";

// 레이어(WFS typeName) — 소해구도(small)가 격자가 촘촘해 항만 단위 분석에 적합하다.
// 대해구도(lage)는 격자가 ~55km로 커서 항만 밖 통항까지 뭉뚱그려진다.
export const MOF_AIS_LAYERS = {
  small: "small_ship_stats_view", // 소해구도
  large: "lage_ship_stats_view", // 대해구도
  msp: "msp_ship_stats_view", // 해양공간계획(MSP)
} as const;

export type MofAisLayer = (typeof MOF_AIS_LAYERS)[keyof typeof MOF_AIS_LAYERS];

// WFS GetFeature 는 maxFeatures 상한이 1000이다. 부산항 bbox면 소해구도 격자×24시간이
// 보통 이 안에 들어오지만, 넘으면 뒤쪽 시간대가 잘리므로 truncated 플래그로 알린다.
const MAX_FEATURES = 1000;

export interface HourlyShipCount {
  hour: number; // 0~23
  count: number; // 해당 시간대 부산 bbox 내 격자 ais 합계
  present: boolean; // 해당 시간대 데이터 존재 여부(false면 결측 — count=0은 "0척"이 아니라 "미제공")
}

export interface BusanShipStats {
  date: string; // 조회한 ship_dt (YYYYMMDD)
  layer: MofAisLayer;
  hourly: HourlyShipCount[]; // 길이 24 (0시~23시)
  totalFeatures: number; // 반환된 격자 피처 수
  truncated: boolean; // maxFeatures(1000) 상한에 걸렸는지
  source: "mof-ais-wfs";
}

export interface FetchBusanShipStatsOptions {
  layer?: MofAisLayer; // 기본 소해구도
  boundingBox?: BoundingBox; // 기본 seed-port 기반 부산 bbox
  signal?: AbortSignal;
}

// 경위도(EPSG:4326) → 웹 메르카토르(EPSG:3857). y는 tan 대신 atanh(sin) 항등식으로 계산한다.
function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const R = 6378137;
  const x = (lon * R * Math.PI) / 180;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = R * 0.5 * Math.log((1 + s) / (1 - s));
  return [x, y];
}

// WFS 필터: ship_dt 일치 + geom BBOX(부산 구역) 를 And 로 묶는다. 둘 다 필수다
// (filter 자체가 필수 파라미터이고, bbox 로 전국 격자를 부산 구역만으로 좁힌다).
function buildFilterXml(dateYmd: string, box: BoundingBox): string {
  const [[latMin, lonMin], [latMax, lonMax]] = box;
  const [xMin, yMin] = lonLatToWebMercator(lonMin, latMin);
  const [xMax, yMax] = lonLatToWebMercator(lonMax, latMax);
  return (
    '<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml">' +
    "<ogc:And>" +
    "<ogc:PropertyIsEqualTo><ogc:PropertyName>ship_dt</ogc:PropertyName>" +
    `<ogc:Literal>${dateYmd}</ogc:Literal></ogc:PropertyIsEqualTo>` +
    "<ogc:BBOX><ogc:PropertyName>geom</ogc:PropertyName>" +
    '<gml:Envelope srsName="EPSG:3857">' +
    `<gml:lowerCorner>${xMin.toFixed(0)} ${yMin.toFixed(0)}</gml:lowerCorner>` +
    `<gml:upperCorner>${xMax.toFixed(0)} ${yMax.toFixed(0)}</gml:upperCorner>` +
    "</gml:Envelope></ogc:BBOX>" +
    "</ogc:And></ogc:Filter>"
  );
}

interface WfsFeature {
  properties?: { ship_time?: string; ship_dt?: string; ais?: number | string };
}

function assertYmd(date: string): void {
  if (!/^\d{8}$/.test(date)) {
    throw new Error(`[mof-ais-stats] date는 YYYYMMDD 8자리여야 합니다: "${date}"`);
  }
}

/**
 * 부산항 bbox 안의 해역 격자를 조회해, 지정한 날짜(ship_dt)의 시간대별 AIS 척수 합계를 반환한다.
 * key/domain 환경변수가 없으면 명확한 에러를 던진다(호출부에서 catch 해 폴백).
 */
export async function fetchBusanShipStats(
  date: string,
  options: FetchBusanShipStatsOptions = {}
): Promise<BusanShipStats> {
  assertYmd(date);

  const key = process.env.MOF_AIS_API_KEY;
  const domain = process.env.MOF_AIS_DOMAIN;
  if (!key || !domain) {
    throw new Error("[mof-ais-stats] MOF_AIS_API_KEY / MOF_AIS_DOMAIN 환경변수가 필요합니다(.env.local).");
  }

  const layer = options.layer ?? MOF_AIS_LAYERS.small;
  const box = options.boundingBox ?? boundingBoxAround(BUSAN_PORT);

  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: layer,
    maxFeatures: String(MAX_FEATURES),
    srsname: "EPSG:3857",
    offeryear: date.slice(0, 4),
    output: "application/json",
    filter: buildFilterXml(date, box),
    key,
    domain,
  });

  const res = await fetch(`${WFS_ENDPOINT}?${params.toString()}`, { signal: options.signal });
  const text = await res.text();

  // 서버는 에러도 HTTP 200 + XML(ServiceException)로 돌려주므로, 본문으로 판별한다.
  if (text.trimStart().startsWith("<")) {
    const code = /ServiceException code="([^"]*)"/.exec(text)?.[1] ?? "UNKNOWN";
    const msg = /<ServiceException[^>]*>([^<]*)</.exec(text)?.[1]?.trim() ?? "";
    throw new Error(`[mof-ais-stats] WFS 오류 ${code}: ${msg}`);
  }

  let json: { features?: WfsFeature[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("[mof-ais-stats] WFS 응답을 JSON으로 파싱하지 못했습니다.");
  }

  const features = json.features ?? [];
  const sums = new Array<number>(24).fill(0);
  const seen = new Array<boolean>(24).fill(false);

  for (const f of features) {
    const p = f.properties;
    if (!p || p.ship_time == null) continue;
    const hour = Number(p.ship_time);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const ais = typeof p.ais === "string" ? Number(p.ais) : p.ais ?? 0;
    sums[hour] += Number.isFinite(ais) ? ais : 0;
    seen[hour] = true;
  }

  const hourly: HourlyShipCount[] = sums.map((count, hour) => ({ hour, count, present: seen[hour] }));

  return {
    date,
    layer,
    hourly,
    totalFeatures: features.length,
    truncated: features.length >= MAX_FEATURES,
    source: "mof-ais-wfs",
  };
}
