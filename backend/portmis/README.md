# backend/portmis

data.go.kr의 **"해양수산부_선박운항정보"**(Port-MIS 항만운영정보시스템 기반 입출항 신고,
`VsslEtrynd5/Info5` 오퍼레이션) 연동. AIS(`backend/ais`)와 상호보완 관계다 —
AIS는 실시간 위치는 주지만 "어디서 왔고 어디로 가는지"는 모르고, Port-MIS는 그 반대로
위치는 없지만 입출항 신고 사실관계(직전 출항항·다음 기항지·선석·톤수 등)가 정확하다.

## 왜 Port-MIS가 "주 소스"인가

aisstream.io 무료 티어는 크라우드소싱 지상 수신기에 의존해 부산 커버리지가 희박하다 —
특히 부산신항(PNC/HJNC)은 거의 안 잡힌다(실측: 누적 400여 척 중 신항권 9척). 반면
Port-MIS는 정부 공식 API라 신항 포함 부산항 입출항 선박을 전수로 담는다(1회 조회 290여 건,
신항 선석만 70여 건). 그래서 역할을 나눈다:
- **지도 마커** → AIS(`ships`): 실시간 위경도가 필요하므로 위치 있는 배만.
- **입출항·정박 목록** → Port-MIS(`port_calls`): 위경도는 없지만 전수를 담는 주 소스.

## 접속 시 주의사항

data.go.kr 게이트웨이는 curl 등 브라우저가 아닌 User-Agent로 호출하면 `410 Gone`으로
위장 차단한다(정상 에러가 아니라 봇 차단 — 파라미터 문제로 착각하기 쉽다). 그래서
`client.ts`는 항상 브라우저 UA/Referer 헤더를 붙여서 호출한다.

## 파일

- `types.ts` — 응답 중 실제 쓰는 필드만 최소로 정의. 필드명은 Swagger 문서가 아니라
  **실제 호출 결과로 확인한 스펙**이다(`prtAgCd`, `clsgn`, `prvsDpmprtPrtNm` 등 원문 그대로).
- `client.ts` — `fetchBusanPortMisEntries(serviceKey, sde, ede)`. 부산항(`prtAgCd=020`)의
  입항(`deGb=I`)·출항(`deGb=O`) 신고를 기간으로 조회해 XML을 파싱한다. `clsgn`(호출부호)을
  생략하면 그 기간·항구의 여러 선박이 목록으로 나온다(단일 선박 조회 전용이 아니다).
- `enrich.ts` — `matchEnrichment(ship, items)`. `Ship.callSign`(우선) 또는 이름(대체)으로
  Port-MIS 신고 건을 찾아 보강 필드를 반환한다. 여러 건이면 신고 시각이 가장 최신인 것을 쓴다.
- `portcalls.ts` — `toPortCall(item)`. Port-MIS 신고 1건을 화면·DB용 `PortCall`로 변환한다
  (최근 detail을 대표로 뽑아 입항/출항·선석·시각을 정한다).
- `portcall-source.ts` — `port_calls` 테이블 읽기/쓰기(snake_case ↔ camelCase 매핑).
  `/api/port-calls`가 `fetchPortCalls()`로 읽는다.
- `run-enrich.ts` — 위 조각을 엮은 실행 스크립트. `npm run enrich:portmis`로 실행하며,
  Port-MIS를 **한 번** 조회해 (1) `port_calls`에 전수 upsert, (2) 현재 `ships`의 선박에
  매칭되면 보강 컬럼만 `update` — 둘 다 수행한다.

## 왜 upsert가 아니라 update인가

`backend/ais/ship-source.ts`의 `shipToRow()`는 Port-MIS 보강 컬럼(`previous_port` 등)을
**절대 포함하지 않는다.** AIS 수집(`ingest:ais`)은 10초마다 위치를 upsert하는데, 그 안에
보강 컬럼까지 같이 upsert하면 매번 null로 덮어써서 `enrich:portmis`가 채운 값이 곧바로
지워진다. 그래서 두 스크립트는 서로 다른 컬럼 집합만 건드리도록 분리했다.

## 실행

```bash
npm run enrich:portmis
```

`MOF_SHIP_OPERATION_KEY`와 Supabase 환경변수가 `.env.local`에 있어야 한다. 신고 데이터는
위치처럼 초 단위로 바뀌지 않으므로 실시간 폴링 대신 필요할 때 수동 실행하거나, 하루 트래픽
상한(10,000건/일 무료 개발계정 기준)을 고려해 몇 분~몇 시간 간격의 크론으로 돌리면 된다.
