// data.go.kr "해양수산부_선박운항정보" API 호출.
//
// 중요: 이 게이트웨이는 curl 등 브라우저가 아닌 User-Agent로 요청하면 "410 Gone"으로
// 위장 차단한다(정상적인 에러 응답이 아니라 봇 차단). 그래서 반드시 브라우저 UA/Referer를
// 붙여서 호출해야 한다 — 이거 없이 디버깅하면 엔드포인트가 죽은 줄 착각하기 쉽다.

import { XMLParser } from "fast-xml-parser";
import type { PortMisDetail, PortMisItem } from "./types";

const BASE_URL = "https://apis.data.go.kr/1192000/VsslEtrynd5/Info5";
const BUSAN_PORT_CODE = "020"; // Port-MIS 항구코드 — 부산
const PAGE_SIZE = 100;
// 하루치 트래픽 상한(10,000건/일). 정박 판정은 조회기간 내 출항 기록을 봐야 정확한데,
// 출항 건이 잘리면 이미 떠난 배를 "정박 중"으로 오판할 수 있어 넉넉히 둔다(방향당 최대 1500건).
const MAX_PAGES = 15;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.data.go.kr/",
};

function yyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStr(v: any): string | undefined {
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDetail(raw: any): PortMisDetail {
  return {
    etryndNm: String(raw.etryndNm ?? ""),
    etryptDt: toStr(raw.etryptDt),
    tkoffDt: toStr(raw.tkoffDt),
    laidupFcltyNm: toStr(raw.laidupFcltyNm),
    grtg: toStr(raw.grtg),
    crewCo: toStr(raw.crewCo),
    satmntEntrpsNm: toStr(raw.satmntEntrpsNm),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeItem(raw: any): PortMisItem {
  const rawDetails = raw.details?.detail;
  const details = rawDetails ? (Array.isArray(rawDetails) ? rawDetails : [rawDetails]) : [];
  return {
    prtAgCd: String(raw.prtAgCd ?? ""),
    prtAgNm: String(raw.prtAgNm ?? ""),
    clsgn: String(raw.clsgn ?? ""),
    vsslNm: String(raw.vsslNm ?? ""),
    vsslNltyNm: toStr(raw.vsslNltyNm),
    vsslKndNm: toStr(raw.vsslKndNm),
    prvsDpmprtPrtNm: toStr(raw.prvsDpmprtPrtNm),
    nxlnptPrtNm: toStr(raw.nxlnptPrtNm),
    details: details.map(normalizeDetail),
  };
}

async function fetchPage(
  serviceKey: string,
  deGb: "I" | "O",
  sde: string,
  ede: string,
  pageNo: number
): Promise<{ items: PortMisItem[]; totalCount: number }> {
  const url = new URL(BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("prtAgCd", BUSAN_PORT_CODE);
  url.searchParams.set("sde", sde);
  url.searchParams.set("ede", ede);
  url.searchParams.set("deGb", deGb);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(PAGE_SIZE));

  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`Port-MIS 요청 실패: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parsed = new XMLParser().parse(xml);
  const header = parsed?.response?.header;
  if (header && header.resultCode !== "00" && header.resultCode !== 0) {
    throw new Error(`Port-MIS 응답 오류: ${header.resultCode} ${header.resultMsg ?? ""}`);
  }

  const body = parsed?.response?.body;
  if (!body?.items) return { items: [], totalCount: 0 };

  const rawItems = body.items.item;
  const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).map(normalizeItem);
  return { items, totalCount: Number(body.totalCount ?? items.length) };
}

/**
 * 부산항(prtAgCd=020)의 입항+출항 신고를 기간(sde~ede)으로 모두 가져온다.
 * 페이지가 여러 장이면 이어붙이되, MAX_PAGES를 넘지 않는다.
 */
export async function fetchBusanPortMisEntries(
  serviceKey: string,
  sde: Date,
  ede: Date
): Promise<PortMisItem[]> {
  const sdeStr = yyyymmdd(sde);
  const edeStr = yyyymmdd(ede);
  const all: PortMisItem[] = [];

  for (const deGb of ["I", "O"] as const) {
    let pageNo = 1;
    for (;;) {
      const { items, totalCount } = await fetchPage(serviceKey, deGb, sdeStr, edeStr, pageNo);
      all.push(...items);
      if (items.length === 0 || pageNo * PAGE_SIZE >= totalCount || pageNo >= MAX_PAGES) break;
      pageNo++;
    }
  }

  return all;
}
