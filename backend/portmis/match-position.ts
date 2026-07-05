// AIS 선박(위치 있음)과 Port-MIS 정박선(공식 신고, 위치 없음)을 대조해 "같은 배"로 판단되는
// 선박만 골라낸다. 목적: aisstream에 쌓인 오래된/무관한 유령 위치를 걸러내고, 공식 기록(Port-MIS)에
// 존재하는 선박의 위치만 지도에 표시하기 위함.
//
// 매칭 키: 호출부호(callSign) 정확일치(강함) → 없으면 선박명 유사도.
// ※ Port-MIS 응답에는 MMSI가 없다 — MMSI는 AIS에만 있는 식별자라 교차 매칭 키로 쓸 수 없다.
//   (MMSI는 AIS 측에서 선박을 유일 식별하는 용도로만 쓰인다.)

import type { PortCall, Ship } from "../ports/port-types";

function normCallSign(s: string | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

function normName(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}

// Levenshtein 편집거리 (짧은 선박명 대상이라 O(m·n)으로 충분)
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

// 0~1 유사도 (1 = 완전 동일). 정규화된 문자열 기준.
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

// 이 값 이상이면 같은 선박명으로 본다(오타·표기차 흡수). 너무 낮추면 오탐이 늘어난다.
export const NAME_SIMILARITY_THRESHOLD = 0.85;

/** ship이 Port-MIS 정박선 목록 중 하나와 "같은 배"로 판단되는가? */
export function isShipInPortMis(ship: Ship, calls: PortCall[], threshold = NAME_SIMILARITY_THRESHOLD): boolean {
  const sc = normCallSign(ship.callSign);
  if (sc && calls.some((c) => normCallSign(c.callSign) === sc)) return true; // 호출부호 정확일치(강함)

  const sn = normName(ship.name);
  if (!sn) return false;
  return calls.some((c) => nameSimilarity(sn, normName(c.vesselName)) >= threshold); // 선박명 유사도
}

/**
 * 위치를 표시할, Port-MIS와 매칭되는 선박만 남긴다.
 * Port-MIS 데이터가 아직 없으면(빈 배열) 안전하게 원본을 그대로 둔다.
 */
export function filterShipsMatchingPortMis(ships: Ship[], calls: PortCall[], threshold = NAME_SIMILARITY_THRESHOLD): Ship[] {
  if (calls.length === 0) return ships;

  // 호출부호 정확일치는 Set으로 O(1) 조회, 이름 유사도는 매칭 안 된 선박만 fallback으로 검사.
  const callSet = new Set(calls.map((c) => normCallSign(c.callSign)).filter(Boolean));
  const misNames = calls.map((c) => normName(c.vesselName)).filter(Boolean);

  return ships.filter((ship) => {
    const sc = normCallSign(ship.callSign);
    if (sc && callSet.has(sc)) return true;
    const sn = normName(ship.name);
    if (!sn) return false;
    return misNames.some((n) => nameSimilarity(sn, n) >= threshold);
  });
}
