// ★ 항만 고유 설정 — 좌표·선석·구역·임계값을 이 파일 한 곳에 몰아넣는다.
// 다른 항만으로 플랫폼을 옮기고 싶으면 이 파일만 교체하면 된다.
// 나머지 코드(backend/prediction, backend/advisor, frontend/components)는
// 이 파일이 내보내는 BUSAN_PORT 를 읽어서 동작할 뿐, 좌표·임계값을 직접 갖지 않는다.

import type { PortConfig } from "./port-types";

export const BUSAN_PORT: PortConfig = {
  name: "부산항",
  center: { lat: 35.05, lon: 129.08 },
  // 부산항은 북항(중심 근처)과 부산신항(중심에서 서쪽 ~27km)이 크게 떨어져 있다.
  // 이 반경이 AIS 수집 bounding box로도 쓰이므로(backend/ais/busan-filter.ts), 25km면
  // 부산항 최대 컨테이너 터미널인 신항(PNC/HJNC)이 통째로 빠진다. 두 항을 모두 덮도록 32km.
  mockAreaRadiusKm: 32,

  berths: [
    { id: "berth-1", name: "감만부두 1번 선석", lat: 35.078, lon: 129.081, capacity: 2 },
    { id: "berth-2", name: "감만부두 2번 선석", lat: 35.075, lon: 129.086, capacity: 2 },
    { id: "berth-3", name: "신선대부두 1번 선석", lat: 35.062, lon: 129.108, capacity: 3 },
    { id: "berth-4", name: "신선대부두 2번 선석", lat: 35.058, lon: 129.112, capacity: 3 },
    { id: "berth-5", name: "북항 1부두", lat: 35.101, lon: 129.041, capacity: 2 },
    { id: "berth-6", name: "북항 2부두", lat: 35.104, lon: 129.038, capacity: 2 },
  ],

  zones: [
    { id: "zone-anchorage", name: "묘박지", center: { lat: 35.02, lon: 129.13 }, radiusKm: 8 },
    { id: "zone-approach", name: "접근수로", center: { lat: 35.04, lon: 129.15 }, radiusKm: 10 },
    { id: "zone-port-limit", name: "항계", center: { lat: 35.05, lon: 129.08 }, radiusKm: 15 },
  ],

  // 부두별 대표 좌표(근사). Port-MIS 선석명을 keyword로 이 부두에 매칭한다.
  // keyword 순서/우선순위: 구체적인 구역명(감천·신항 등)이 먼저 걸리도록 배열 앞쪽에 둔다.
  berthAreas: [
    { id: "sinhang", name: "부산신항", lat: 35.081, lon: 128.79, keywords: ["신항"] },
    { id: "gamcheon", name: "감천항", lat: 35.075, lon: 129.01, keywords: ["감천", "5물량장", "선기조합", "강남조선", "동일 조선", "서방파제", "구평"] },
    { id: "dadaepo", name: "다대포항", lat: 35.045, lon: 128.968, keywords: ["다대"] },
    { id: "sinseondae", name: "신선대부두", lat: 35.065, lon: 129.083, keywords: ["신선대", "7부두 7"] },
    { id: "gamman", name: "감만부두", lat: 35.078, lon: 129.079, keywords: ["감만"] },
    { id: "uam", name: "우암·동명부두", lat: 35.093, lon: 129.066, keywords: ["우암", "동명"] },
    { id: "bukhang", name: "북항(재래·자성대)", lat: 35.106, lon: 129.043, keywords: ["자성대", "중앙부두", "국제여객", "북항크루즈", "관공선", "연합부두", "소형선부두", "북항사설조선소"] },
    { id: "yeongdo", name: "영도(봉래·청학·조선소)", lat: 35.088, lon: 129.045, keywords: ["영도", "대평동", "봉래동", "청학", "부산조선안벽", "선진", "삼한안벽", "미원안벽", "한진"] },
    { id: "namhang", name: "남항(자갈치·대교동)", lat: 35.093, lon: 129.028, keywords: ["남항", "대교동", "연안유람선", "자갈치", "충무", "남부민"] },
    { id: "yongho", name: "용호부두", lat: 35.115, lon: 129.108, keywords: ["용호"] },
    { id: "anchorage", name: "남외항 묘박지", lat: 35.0, lon: 129.03, keywords: ["남외항", "박지", "정박지", "묘지"] },
  ],

  // level = 0.0~0.3 원활, 0.3~0.6 보통, 0.6~1.0 혼잡
  congestionThresholds: { low: 0.3, medium: 0.6 },

  // (AIS 혼잡도) 시간당 이 척수를 초과해 입항하면 혼잡도 level = 1(포화)로 간주
  shipsPerHourCapacity: 4,

  // (Port-MIS 혼잡도) 부산항 전체(북항·신항·감천·다대포) 시간당 입항 신고가 이 건수면 포화(=1).
  // 실측 분포상 시간당 입항이 1~13건, 평시 5~7건이라 피크가 혼잡으로 뜨도록 12로 둔다.
  arrivalCapacityPerHour: 12,

  // (해수부 연안AIS 통계 혼잡도) 32km bbox(mockAreaRadiusKm) 안 시간당 AIS 척수를 level=1로 볼 기준.
  // 2024 실측(gicoms WFS small_ship_stats_view)상 이 구역 시간당 척수가 ~1400~1660이라, 피크가
  // 혼잡(≈0.8)으로 뜨도록 2000으로 둔다. bbox 크기에 종속된 값이라 반경이 바뀌면 재보정 필요.
  aisStatsHourlyCapacity: 2000,

  // 지역별 혼잡도 분할.
  //  - 시간대별 곡선: AIS 통계를 center±radiusKm bbox로 조회 → aisHourlyCapacity 로 정규화.
  //  - 입출항 수치: Port-MIS berthAreaId 집계.
  // aisHourlyCapacity 는 2024 실측(소해구도 시간당 척수) 기반 근사: 북항·감천 셀 피크 ~875,
  // 신항 셀 ~167. ⚠️ 북항·감천은 같은 AIS 셀이라 aisSeparable=false(곡선 유사).
  congestionRegions: [
    {
      id: "busan",
      name: "부산(북항)",
      center: { lat: 35.09, lon: 129.07 },
      radiusKm: 6,
      aisHourlyCapacity: 1100,
      aisSeparable: false,
      berthAreaIds: ["bukhang", "sinseondae", "gamman", "uam", "namhang", "yeongdo", "yongho", "anchorage"],
      isDefault: true,
    },
    {
      id: "gamcheon",
      name: "감천항",
      center: { lat: 35.078, lon: 129.01 },
      radiusKm: 4,
      aisHourlyCapacity: 1100,
      aisSeparable: false,
      berthAreaIds: ["gamcheon", "dadaepo"],
    },
    {
      id: "sinhang",
      name: "부산신항",
      center: { lat: 35.081, lon: 128.79 },
      radiusKm: 8,
      aisHourlyCapacity: 250,
      aisSeparable: true,
      berthAreaIds: ["sinhang"],
    },
  ],

  // ── 동시 재항 척수 용량 + 대기시간 보정 ──
  // 2019-01~2024-12 부산항만공사 입출항 집계 270,357건에서 구간겹침 스윕으로 산출.
  // 검증: 컨테이너 동시재항 중앙 39척 ≈ 물리 컨테이너 선석 40석 (평시 선석 포화).
  portCallCapacity: {
    source: "부산항만공사 입출항 집계 2019-01~2024-12 (270,357건)",
    portWide: { p50: 300, p95: 341, p99: 367, max: 426 },
    container: { p50: 39, p95: 50, p99: 56, max: 75 },
    containerBerths: 40, // 북항 17 + 신항 23 (busan-throughput 참조)
    totalBerths: 40,
    dwellMedianHours: 20.7,
    // 혼잡도별 재항시간 실측: 컨테이너 16→20h, 탱커 20→27h. P75 꼬리로 대기 추정.
    wait: {
      container: { freeDwellHours: 16, congestedExtraHours: 8, onsetLevel: 0.7 },
      tanker: { freeDwellHours: 20, congestedExtraHours: 14, onsetLevel: 0.65 },
      default: { freeDwellHours: 18, congestedExtraHours: 10, onsetLevel: 0.7 },
    },
    // 시간대(0~23시) 평시=1.0 대비 계수 — 항 전체는 장기재항선이 많아 일중 변동 ±1%.
    hourOfDayFactor: [
      0.993, 0.997, 0.999, 1.0, 0.999, 0.997, 0.996, 1.003, 1.008, 1.01, 1.01, 1.009,
      1.006, 1.005, 1.004, 1.002, 0.999, 0.996, 0.995, 0.995, 0.996, 0.994, 0.995, 0.992,
    ],
    // 월(1~12월) 계수 — 2월 성수기(+7%), 9~12월 한산(-5%).
    monthFactor: [
      1.026, 1.073, 1.038, 1.031, 1.043, 1.007, 0.986, 0.995, 0.947, 0.953, 0.953, 0.952,
    ],
  },
};
