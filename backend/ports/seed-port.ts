// ★ 항만 고유 설정 — 좌표·선석·구역·임계값을 이 파일 한 곳에 몰아넣는다.
// 다른 항만으로 플랫폼을 옮기고 싶으면 이 파일만 교체하면 된다.
// 나머지 코드(backend/prediction, backend/advisor, frontend/components)는
// 이 파일이 내보내는 BUSAN_PORT 를 읽어서 동작할 뿐, 좌표·임계값을 직접 갖지 않는다.

import type { PortConfig } from "./port-types";
import { BUSAN_GUIDELINE_APPROACH_ROUTES } from "./busan-guideline-routes";

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

  // ── 해양기상/파랑/조위/조류 API 조회용 관측소 코드 ──
  // TODO: 각 기관 문서(API 신청 승인 메일/명세서)에서 부산항과 가장 가까운 코드를 확인해 채운다.
  // 빈 문자열인 동안은 backend/marine/* 의 fetch 함수가 "미설정"으로 보고 null 을 반환한다.
  marineStations: {
    nmpntOrgCode: "", // 국립해양측위정보원 해양기상 API 기관코드(mmaf)
    nmpntStationId: "", // 국립해양측위정보원 해양기상 API 지점코드(mmsi) — 부산 인근 관측지점
    khoaTideStationId: "DT_0005", // 국립해양조사원 조위관측소 코드 — 부산(실측 확인 완료, 2026-07-09)
    khoaWaveStationId: "TW_0062", // 국립해양조사원 국가해양관측망 관측소 코드 — 해운대해수욕장(부산, 실측 확인 완료 2026-07-09)
    khoaCurrentStationId: "16LTC13", // 국립해양조사원 조류예측 지점 코드 — 부산항입구(실측 확인 완료 2026-07-09)
  },

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

  // VTS 근접 충돌위험 경보 경계값. 부산항 접근수로·항계는 폭이 넓지 않아,
  // 최근접 0.5해리(≈925m) 이내면 주의, 0.25해리(≈460m) 이내면 위험으로 본다.
  // 15분 이내에 최근접이 예상될 때만 경보하고, 0.5kn 미만(접안·묘박)은 판정에서 뺀다.
  // 상대속도 2kn 미만은 붐비는 정박지에서 서로 가까이 떠 있을 뿐인 저속 쌍이라 제외한다.
  // 총톤수 300 미만 소형선(어선 등)은 개별 충돌 경보 대상에서 뺀다(실 VTS 관행).
  collisionRisk: {
    cpaWarnNm: 0.5,
    cpaDangerNm: 0.25,
    tcpaHorizonMin: 15,
    ignoreSpeedKn: 0.5,
    minClosingSpeedKn: 2,
    minMonitoredGrossTonnage: 300,
  },

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

  simulationDestinations: [
    {
      id: "busan-north",
      name: "부산항 북항",
      shortName: "북항",
      center: { lat: 35.09, lon: 129.07 },
      congestionRegionId: "busan",
    },
    {
      id: "gamcheon",
      name: "감천항",
      shortName: "감천",
      center: { lat: 35.078, lon: 129.01 },
      congestionRegionId: "gamcheon",
    },
    {
      id: "busan-new",
      name: "부산신항",
      shortName: "신항",
      center: { lat: 35.081, lon: 128.79 },
      congestionRegionId: "sinhang",
    },
  ],

  // 접근 경로 — 해수부 항만가이드라인 지정항로에서 추출한 실측 중심선(backend/ports/busan-guideline-routes.ts).
  approachRoutes: BUSAN_GUIDELINE_APPROACH_ROUTES,

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
    containerHourlyCapacity: {
      source: "codex_energy_data_pack_utf8_fixed/data/port-hourly-capacity.csv",
      defaultBasis: "mixed-800-teu",
      mixedCallsPerHour: 3.203,
      largeCallsPerHour: 1.025,
      teuPerHour: 2562.4,
      note: "에너지 절감 의사결정용 컨테이너 처리능력 요약값. 기존 Port-MIS 혼잡도는 arrivalCapacityPerHour와 portWide 재항 분포를 계속 사용한다.",
    },
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

  // 정박료 + 탄소 그림자가격 정책 — 출처를 밝힐 수 있는 실측/시세 값만 남겼다.
  // (예선료·선원인건비·대기(체선)비용·냉동컨테이너 전력비는 신뢰할 만한 공개 요율 자료를
  //  찾지 못해 모델에서 제외했다. 임의 추정치를 "공식 수치"처럼 내놓지 않기 위한 결정.)
  //
  //  - foreignGoing/coastal: 해양수산부 고시 제2018-174호 [별표1]
  //    "무역항의 항만시설 사용 및 사용료에 관한 규정"(항만법 시행령 제46조 제2항) 실측 요율.
  //    정박료 기본료(10톤·12시간당): 외항선 187원, 내항선 61원.
  //    초과사용료(10톤·1시간당): 외항선 15.7원, 내항선 5.2원. 총톤수 150톤 이상 선박 대상.
  //  - fxKrwPerUsd: 2026-07-07 USD/KRW 시장환율(~1,515.64) 스냅샷. 실시간 아님, 안내용.
  //  - carbonShadowPriceUsdPerTon: EU ETS 2026년 평균 전망 ~€85/tCO2 × 2026-07-09 EUR/USD
  //    1.1443 ≈ $97/tCO2. 부산항이 실제 부과하는 요금이 아니라 국제 탄소시장 참고 지표.
  //    (참고: 부산항만공사는 2026-01-01부터 실제 "친환경선박(ESI) 인센티브" 제도를 시행 중이며
  //    ESI 35~49.9점 5%/50점 이상 10% 항만시설사용료 감면이지만, ESI 산출에 필요한 NOx·SOx·
  //    육상전원공급 데이터가 없어 이 플랫폼에서는 금액으로 재현하지 않는다.)
  portDue: {
    minGrossTonnageForFee: 150,
    foreignGoing: { base10TonPer12hKrw: 187, excess10TonPer1hKrw: 15.7 },
    coastal: { base10TonPer12hKrw: 61, excess10TonPer1hKrw: 5.2 },
    fxKrwPerUsd: 1515.64,
    carbonShadowPriceUsdPerTon: 97,
  },
};
