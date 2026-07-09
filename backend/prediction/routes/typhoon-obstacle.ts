// 태풍 최신 위치를 water-path.ts 가 쓰는 LandObstacle(원형 폴리곤)로 변환한다.
// AI 계산 경로(ai-route.ts)가 이 폴리곤을 육지 장애물과 똑같이 취급해 피해가도록 만든다.
// 좌표는 태풍 실시간 위치(backend/marine/typhoon.ts)에서만 오고, 이 파일엔 하드코딩하지 않는다.

import type { LandObstacle } from "../../ports/busan-land-obstacles";
import type { TyphoonInfo } from "../../marine/types";

// 태풍 중심 반경 이 거리(km) 안쪽은 회피 구역으로 간주한다.
// ⚠️ 실제 태풍 강풍반경(통상 250~400km급)보다 훨씬 좁다 — 이 앱의 해수부 지정항로는
// 중심선 길이가 보통 2~3NM(4~6km)급으로 짧고, 시뮬레이션 선박도 항계 반경
// (BUSAN_PORT.mockAreaRadiusKm≈32km) 안에서 출발한다. 실제 강풍반경을 그대로 쓰면
// 항로 전체·출발점·도착점이 통째로 회피구역 안에 들어가 "돌아갈 곳이 없는" 상태가 된다.
// 그래서 여기서는 "태풍 중심 바로 인근 국지 회피" 정도로 좁혀 잡는다 — 태풍이 정말 이만큼
// 가까우면 경로를 틀어서 해결될 상황이 아니라 출항 자체를 재검토해야 하며, 그 경고는
// scoreRouteScenario의 seaRisk 가중치(모든 경로에 동일 적용)가 이미 담당한다.
const TYPHOON_AVOIDANCE_RADIUS_KM = 5;
const CIRCLE_SIDES = 16;
const KM_PER_DEG_LAT = 110.574;

function circleRing(lat: number, lon: number, radiusKm: number, sides: number): [number, number][] {
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides;
    const dLat = (radiusKm * Math.cos(angle)) / KM_PER_DEG_LAT;
    const dLon = (radiusKm * Math.sin(angle)) / kmPerDegLon;
    ring.push([lon + dLon, lat + dLat]);
  }
  return ring;
}

/**
 * 활성 태풍 목록에서 각 태풍의 최신 위치를 중심으로 한 원형 회피구역 폴리곤을 만든다.
 * 태풍이 없으면 빈 배열(회피구역 없음 = 육지만 피하는 최단 경로).
 */
export function buildTyphoonAvoidanceObstacles(
  typhoons: TyphoonInfo[],
  radiusKm: number = TYPHOON_AVOIDANCE_RADIUS_KM
): LandObstacle[] {
  return typhoons
    .map((typhoon) => typhoon.track.at(-1))
    .filter((point): point is NonNullable<typeof point> => Boolean(point))
    .map((point) => ({ ring: circleRing(point.lat, point.lon, radiusKm, CIRCLE_SIDES) }));
}
