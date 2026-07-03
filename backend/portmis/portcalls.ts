// Port-MIS 응답(PortMisItem)을 화면·DB용 PortCall로 변환한다.
// 한 선박에 입항/출항 등 여러 detail이 있으면 가장 최근 신고를 대표로 쓴다.

import type { PortCall, PortCallEvent } from "../ports/port-types";
import type { PortMisDetail, PortMisItem } from "./types";

function detailTime(d: PortMisDetail): number {
  return new Date(d.tkoffDt ?? d.etryptDt ?? 0).getTime();
}

function latestDetail(item: PortMisItem): PortMisDetail | undefined {
  return [...item.details]
    .filter((d) => d.etryptDt || d.tkoffDt)
    .sort((a, b) => detailTime(b) - detailTime(a))[0];
}

function normalizeEvent(name: string | undefined): PortCallEvent {
  return name === "출항" ? "출항" : "입항";
}

export function toPortCall(item: PortMisItem): PortCall {
  const detail = latestDetail(item);
  return {
    callSign: item.clsgn?.trim() || "",
    vesselName: item.vsslNm?.trim() || `(호출부호 ${item.clsgn})`,
    vesselType: item.vsslKndNm,
    nationality: item.vsslNltyNm,
    previousPort: item.prvsDpmprtPrtNm,
    nextPort: item.nxlnptPrtNm,
    event: normalizeEvent(detail?.etryndNm),
    eventTime: detail ? new Date(detailTime(detail)).toISOString() : undefined,
    berthName: detail?.laidupFcltyNm,
    grossTonnage: detail?.grtg ? Number(detail.grtg) : undefined,
  };
}
