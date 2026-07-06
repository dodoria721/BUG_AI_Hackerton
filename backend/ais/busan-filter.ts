// 부산항 인근 지리적 범위(bounding box)와 AIS 목적지 텍스트로 "부산행/부산발" 선박을 가려낸다.
// AIS에는 출발항/도착항 필드가 따로 없다 — 위치·목적지 텍스트뿐이므로, 이 두 신호를 함께 쓴다.

import type { LatLon, PortConfig } from "../ports/port-types";

export type LatLonPair = [number, number];
export type BoundingBox = [LatLonPair, LatLonPair];

// 임의의 중심점 ± radiusKm 사각형을 bounding box(대각 꼭짓점 2개)로 변환한다.
// 지역별 AIS 통계 조회(구역 bbox)에도 재사용한다.
export function boundingBoxAroundPoint(center: LatLon, radiusKm: number): BoundingBox {
  const latDeg = radiusKm / 111; // 1도 ≈ 111km
  const lonDeg = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lat - latDeg, center.lon - lonDeg],
    [center.lat + latDeg, center.lon + lonDeg],
  ];
}

// PortConfig.center ± mockAreaRadiusKm 사각형을 bounding box로 변환한다.
// 목업 선박 생성 반경과 동일한 값을 실 AIS 구독 반경으로도 쓴다 — "부산항 인근"의 정의를
// seed-port.ts 한 곳에서만 관리하기 위해서다.
export function boundingBoxAround(config: PortConfig): BoundingBox {
  return boundingBoxAroundPoint(config.center, config.mockAreaRadiusKm);
}

export function isWithinBoundingBox(point: LatLon, box: BoundingBox): boolean {
  const [[latMin, lonMin], [latMax, lonMax]] = box;
  return point.lat >= latMin && point.lat <= latMax && point.lon >= lonMin && point.lon <= lonMax;
}

const BUSAN_DESTINATION_TOKENS = ["BUSAN", "PUSAN", "KRPUS"];

// AIS Destination은 6-bit ASCII 여백이 "@"로 채워져 들어온다(예: "COASTGUARD@@@@@@@@").
// 매칭 전에 제거하고, 비어 있으면(=선박이 아직 목적지를 방송하지 않음) false를 반환한다 —
// "아니오"가 아니라 "판단 불가"이므로, 호출부에서 지리적 필터와 함께 판단해야 한다.
export function isBusanDestination(destination: string | undefined | null): boolean {
  if (!destination) return false;
  const cleaned = destination.replace(/@+/g, " ").trim().toUpperCase();
  if (!cleaned) return false;
  return BUSAN_DESTINATION_TOKENS.some((token) => cleaned.includes(token));
}
