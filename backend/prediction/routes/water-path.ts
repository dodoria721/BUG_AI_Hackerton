// 선박 현재위치 → 지정항로 진입점을 잇는 구간이 섬(영도 등)을 관통하지 않도록,
// 육지 장애물 폴리곤(backend/ports/busan-land-obstacles.ts)을 피하는 최단 경로를 만든다.
//  - 방식: 가시성 그래프(visibility graph) + Dijkstra. ML 없이 순수 기하 계산(결정론적).
//  - 두 점 사이 직선이 이미 물 위면 그대로 직선을 쓴다(우회 불필요).
//  - 항해 지시가 아니라 지도 표시/거리 근사용. 장애물은 근사 폴리곤이라 안전 항로가 아니다.

import { BUSAN_LAND_OBSTACLES, type LandObstacle } from "../../ports/busan-land-obstacles";

export interface GeoPoint {
  lat: number;
  lng: number;
}

type XY = [number, number]; // [lng, lat]

const R_KM = 6371;
const LON_SCALE = Math.cos((35 * Math.PI) / 180); // 위경도 평면근사용 경도 스케일
const VERTEX_OFFSET_DEG = 0.0009; // 장애물 꼭짓점을 바깥으로 살짝 밀어 코너를 돌 수 있게(~90m)

function havKm(a: XY, b: XY): number {
  const t = Math.PI / 180;
  const dLat = (b[1] - a[1]) * t;
  const dLon = (a[0] - b[0]) * -t;
  const la1 = a[1] * t;
  const la2 = b[1] * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

function pointInRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 두 선분(a-b, c-d)의 "진짜" 교차(끝점 공유는 교차로 보지 않음).
function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const o = (p: XY, q: XY, r: XY) => {
    const val = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.abs(val) < 1e-12) return 0;
    return val > 0 ? 1 : 2;
  };
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

// 선분이 어떤 장애물이라도 통과하는가(경계 교차 또는 내부 관통).
function blocked(a: XY, b: XY, obstacles: LandObstacle[]): boolean {
  const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const obs of obstacles) {
    const ring = obs.ring;
    if (pointInRing(mid, ring)) return true;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (segmentsIntersect(a, b, ring[i], ring[j])) return true;
    }
  }
  return false;
}

// 장애물 꼭짓점을 폴리곤 "바깥"으로 살짝 밀어 그래프 노드로 쓴다(코너를 스쳐 돌 수 있게).
// 인접 두 변의 법선 평균 방향으로 밀되, 안쪽으로 향하면 뒤집는다 — 크고 오목한 본토
// 폴리곤에서도 항상 바다 쪽(바깥)으로 나가도록.
function buildOffsetVertices(obstacles: LandObstacle[]): XY[] {
  const nodes: XY[] = [];
  for (const obs of obstacles) {
    const ring = obs.ring;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const prev = ring[(i - 1 + n) % n];
      const cur = ring[i];
      const next = ring[(i + 1) % n];
      // 변 방향(스케일 공간)의 법선 perp(dx,dy)=(dy,-dx)
      const n1 = perpUnit(prev, cur);
      const n2 = perpUnit(cur, next);
      let nx = n1[0] + n2[0];
      let ny = n1[1] + n2[1];
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      // 스케일 공간 방향 → 실제 경위도 offset
      let cand: XY = [cur[0] + (nx / LON_SCALE) * VERTEX_OFFSET_DEG, cur[1] + ny * VERTEX_OFFSET_DEG];
      if (pointInRing(cand, ring)) cand = [cur[0] - (nx / LON_SCALE) * VERTEX_OFFSET_DEG, cur[1] - ny * VERTEX_OFFSET_DEG];
      nodes.push(cand);
    }
  }
  return nodes;
}

// 변 a→b 의 단위 법선(스케일 공간). perp(dx,dy) = (dy, -dx).
function perpUnit(a: XY, b: XY): XY {
  const dx = (b[0] - a[0]) * LON_SCALE;
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dy / len, -dx / len];
}

// 점 p 에서 선분 a-b 위 가장 가까운 점(스케일 공간 기준).
function closestOnSegment(p: XY, a: XY, b: XY): XY {
  const ax = a[0] * LON_SCALE, ay = a[1], bx = b[0] * LON_SCALE, by = b[1], px = p[0] * LON_SCALE, py = p[1];
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return [(ax + t * dx) / LON_SCALE, ay + t * dy];
}

// 육지(장애물) 안에 있는 점을 가장 가까운 물가 바로 바깥으로 끌어낸다. 매립 부두 근처 등
// 거친 폴리곤 안쪽에 선박이 잡히는 경우, 직선 폴백(대형 육지 관통) 대신 물가에서 경로를 시작한다.
function pullToWater(p: XY, obstacles: LandObstacle[]): XY {
  const owner = obstacles.find((o) => pointInRing(p, o.ring));
  if (!owner) return p;
  let best: XY | null = null;
  let bestD = Infinity;
  const ring = owner.ring;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const q = closestOnSegment(p, ring[j], ring[i]);
    const d = Math.hypot((q[0] - p[0]) * LON_SCALE, q[1] - p[1]);
    if (d < bestD) { bestD = d; best = q; }
  }
  if (!best) return p;
  // p(안쪽) → q(경계) 방향으로 조금 더 밀어 바깥으로. 여전히 안쪽이면 폭을 키운다.
  const dirX = (best[0] - p[0]) * LON_SCALE, dirY = best[1] - p[1];
  const len = Math.hypot(dirX, dirY) || 1;
  for (const extra of [0.0012, 0.003, 0.006]) {
    const cand: XY = [best[0] + (dirX / len / LON_SCALE) * extra, best[1] + (dirY / len) * extra];
    if (!obstacles.some((o) => pointInRing(cand, o.ring))) return cand;
  }
  return best;
}

// 정적 장애물(기본 육지 목록) 꼭짓점 그래프는 1회만 계산해 메모한다.
// ⚠️ 캐시는 obstacles 가 기본 BUSAN_LAND_OBSTACLES 그대로일 때만 재사용한다 — 태풍 회피구역처럼
// 매 호출마다 달라지는 장애물이 섞이면, 캐시가 이전(태풍 없는) 그래프를 그대로 돌려줘서
// 새 장애물이 조용히 무시되는 버그가 생긴다(실측: 태풍 장애물을 넘겨도 회피 안 됨).
let cachedVertices: XY[] | null = null;
let cachedAdj: number[][] | null = null; // adj[i] = 보이는 정점 인덱스들
function ensureGraph(obstacles: LandObstacle[]): { vertices: XY[]; adj: number[][] } {
  const cacheable = obstacles === BUSAN_LAND_OBSTACLES;
  if (cacheable && cachedVertices && cachedAdj) return { vertices: cachedVertices, adj: cachedAdj };
  const vertices = buildOffsetVertices(obstacles);
  const adj: number[][] = vertices.map(() => []);
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (!blocked(vertices[i], vertices[j], obstacles)) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  if (cacheable) {
    cachedVertices = vertices;
    cachedAdj = adj;
  }
  return { vertices, adj };
}

/**
 * start → goal 을 잇는, 육지를 피한 경로점 목록을 반환한다(start·goal 포함).
 * 직선이 이미 물 위면 [start, goal]. 우회가 필요하면 장애물 꼭짓점을 경유한 최단 경로.
 * 경로를 못 찾으면(이례적) 직선으로 폴백한다.
 */
export function computeWaterPath(
  start: GeoPoint,
  goal: GeoPoint,
  obstacles: LandObstacle[] = BUSAN_LAND_OBSTACLES
): GeoPoint[] {
  const rawS: XY = [start.lng, start.lat];
  const g: XY = [goal.lng, goal.lat];
  if (obstacles.length === 0) return [start, goal];

  // 선박이 육지(거친 폴리곤) 안이면 물가로 끌어낸다. 원래 선박 위치는 표시용으로 앞에 붙인다.
  const s = pullToWater(rawS, obstacles);
  const pulled = s[0] !== rawS[0] || s[1] !== rawS[1];
  const prefix: GeoPoint[] = pulled ? [start] : [];
  const sPoint: GeoPoint = { lat: s[1], lng: s[0] };

  if (!blocked(s, g, obstacles)) return dedupePoints([...prefix, sPoint, goal]);

  const { vertices, adj } = ensureGraph(obstacles);
  const N = vertices.length;
  const S = N; // start 인덱스
  const G = N + 1; // goal 인덱스
  const nodes: XY[] = [...vertices, s, g];

  // start·goal 에서 보이는 정점 연결(+ 직접 연결 가능하면 S-G)
  const extra: Map<number, number[]> = new Map();
  extra.set(S, []);
  extra.set(G, []);
  for (let i = 0; i < N; i++) {
    if (!blocked(s, vertices[i], obstacles)) extra.get(S)!.push(i);
    if (!blocked(g, vertices[i], obstacles)) extra.get(G)!.push(i);
  }
  const sgVisible = !blocked(s, g, obstacles); // 여기선 항상 false지만 방어적으로

  const neighbors = (idx: number): number[] => {
    if (idx < N) {
      const base = adj[idx].slice();
      if (!blocked(nodes[idx], s, obstacles)) base.push(S);
      if (!blocked(nodes[idx], g, obstacles)) base.push(G);
      return base;
    }
    if (idx === S) return sgVisible ? [...extra.get(S)!, G] : extra.get(S)!;
    return sgVisible ? [...extra.get(G)!, S] : extra.get(G)!;
  };

  // Dijkstra
  const dist = new Array(N + 2).fill(Infinity);
  const prev = new Array(N + 2).fill(-1);
  const done = new Array(N + 2).fill(false);
  dist[S] = 0;
  for (let iter = 0; iter < N + 2; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < N + 2; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1 || u === G) break;
    done[u] = true;
    for (const v of neighbors(u)) {
      const w = havKm(nodes[u], nodes[v]);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }

  if (dist[G] === Infinity) return [start, goal]; // 폴백
  const path: number[] = [];
  for (let at = G; at !== -1; at = prev[at]) path.push(at);
  path.reverse();
  const routed = path.map((idx) => (idx === S ? sPoint : idx === G ? goal : { lat: nodes[idx][1], lng: nodes[idx][0] }));
  return dedupePoints([...prefix, ...routed]);
}

// 연속 중복 점 제거.
function dedupePoints(pts: GeoPoint[]): GeoPoint[] {
  return pts.filter((p, i, a) => i === 0 || p.lat !== a[i - 1].lat || p.lng !== a[i - 1].lng);
}
