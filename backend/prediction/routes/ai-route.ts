// 해수부 지정항로(고정 3개 후보)와 별개로, 선박 현재위치 → 목적지를 직접 계산하는
// "AI 계산 경로" — 육지(BUSAN_LAND_OBSTACLES)와 활성 태풍 위험구역(있으면)을 모두
// water-path.ts 의 가시성그래프+다익스트라 회피 대상으로 넘긴다.
// ML 없이 결정론적 기하 계산. ⚠️ 실제 항로표지·수심·통항분리대를 반영하지 않으므로
// 항해 지시가 아니라 "지정항로 대비 비교용 참고 경로"다.
//
// ⚠️ 실측으로 확인된 한계: water-path.ts 의 가시성그래프는 "선박→지정항로 진입점" 같은
// 짧은 구간(수 km)용으로 설계돼 있다. 선박→목적지를 30km+ 단일 구간으로 통째로 넘기면
// 복잡한 해안선(영도·가덕도 등)에서 그래프가 시작점과 도착점을 못 잇고(dist=Infinity)
// 직선으로 조용히 폴백해버린다(회피가 전혀 안 먹힌 것처럼 보임). 그래서 구간을 통째로
// 넘기지 않고, 이미 안전이 검증된 해수부 지정항로 waypoint를 경유점으로 삼아 짧은 구간
// (선박→wp1, wp1→wp2, ...) 으로 쪼개 각각 계산한다 — 짧은 구간은 이미 3개 지정항로의
// 접근 구간에서 안정적으로 동작함이 확인됐다.

import { BUSAN_LAND_OBSTACLES } from "../../ports/busan-land-obstacles";
import type { TyphoonInfo } from "../../marine/types";
import { buildTyphoonAvoidanceObstacles } from "./typhoon-obstacle";
import { computeWaterPath, type GeoPoint } from "./water-path";

/**
 * 선박 위치 → (경유점들) → 목적지를, 육지와 활성 태풍 위험구역을 피해 구간별로 계산한
 * 경로점 목록을 반환한다(시작점·도착점 포함). anchorWaypoints 는 보통 이미 검증된 해수부
 * 지정항로의 waypoint를 넘긴다 — 태풍이 없으면 각 구간은 사실상 직선(=지정항로와 유사),
 * 태풍이 특정 구간을 막으면 그 구간만 국지적으로 우회한다.
 */
export function computeAiRoutePoints(
  ship: GeoPoint,
  destination: GeoPoint,
  typhoons: TyphoonInfo[],
  anchorWaypoints: GeoPoint[] = []
): GeoPoint[] {
  const obstacles = [...BUSAN_LAND_OBSTACLES, ...buildTyphoonAvoidanceObstacles(typhoons)];
  const legs = [ship, ...anchorWaypoints, destination];

  const points: GeoPoint[] = [legs[0]];
  for (let i = 0; i < legs.length - 1; i += 1) {
    const legPoints = computeWaterPath(legs[i], legs[i + 1], obstacles);
    points.push(...legPoints.slice(1)); // legPoints[0] == legs[i] == 직전 구간의 마지막 점(중복 제거)
  }
  return points;
}
