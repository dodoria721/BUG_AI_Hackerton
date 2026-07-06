-- Supabase SQL 에디터에 붙여넣어 실행하세요.
-- (SQL 에디터로 만들면 RLS는 기본 off라 서버의 anon/service 키로 바로 읽고 쓸 수 있습니다.)

create table if not exists public.ships (
  mmsi                  text primary key,
  name                  text not null,
  lat                   double precision not null,
  lon                   double precision not null,
  sog                   double precision not null,          -- 속력 (knots)
  cog                   double precision not null,          -- 침로 (0~360)
  eta                   timestamptz not null,               -- 입항 예정 시각
  status                text not null check (status in ('underway','anchored','moored')),
  destination_berth_id  text,
  call_sign             text,                                -- AIS 호출부호 (Port-MIS 매칭 키)
  imo                   text,                                -- AIS ShipStaticData IMO 선박식별번호
  -- ↓ Port-MIS(해양수산부_선박운항정보) 입출항 신고 매칭 보강 필드. AIS 10초 폴링 upsert는
  --   이 컬럼들을 절대 건드리지 않는다(backend/ais/ship-source.ts의 shipToRow 참고) —
  --   backend/portmis/run-enrich.ts만 별도 update로 채운다.
  previous_port         text,                                -- 직전 출항항
  next_port             text,                                -- 다음 기항지
  berth_name            text,                                -- Port-MIS 신고상 접안/정박 시설명
  gross_tonnage         double precision,                     -- 총톤수
  crew_count            int,                                  -- 승무원수
  agent_company         text,                                 -- 선박관리/대리점 업체명
  updated_at            timestamptz not null default now()
);

-- 이미 ships 테이블이 있던 프로젝트(테이블 생성이 위 create table 문을 건너뜀)를 위한
-- 컬럼 추가. 새로 만드는 경우에도 그대로 실행해도 안전하다(멱등).
alter table public.ships add column if not exists call_sign text;
alter table public.ships add column if not exists imo text;
alter table public.ships add column if not exists previous_port text;
alter table public.ships add column if not exists next_port text;
alter table public.ships add column if not exists berth_name text;
alter table public.ships add column if not exists gross_tonnage double precision;
alter table public.ships add column if not exists crew_count int;
alter table public.ships add column if not exists agent_company text;

-- Port-MIS(해양수산부_선박운항정보) 입출항 신고 — 부산항 정박/입출항 선박 전수.
-- AIS(ships)는 실시간 위치가 있지만 aisstream 무료 커버리지가 희박하다. 이 테이블은
-- 공식 API 기반이라 신항 포함 전수를 담는다(단 실시간 위경도는 없음).
-- backend/portmis/run-enrich.ts가 주기적으로 upsert한다.
create table if not exists public.port_calls (
  call_sign      text not null,
  vessel_name    text not null,
  vessel_type    text,                                 -- 선종
  nationality    text,                                 -- 선적국
  previous_port  text,                                 -- 직전 출항항
  next_port      text,                                 -- 다음 기항지
  event          text,                                 -- 입항 | 출항 (최근 신고)
  event_time     timestamptz,                          -- 해당 신고 시각
  berth_name     text,                                 -- 접안/정박 시설명
  gross_tonnage  double precision,                     -- 총톤수
  updated_at     timestamptz not null default now(),
  -- 호출부호가 빈 소형선도 있어 선박명을 함께 키로 써서 선박당 1행(최신)만 유지한다.
  primary key (call_sign, vessel_name)
);

-- 최근 24시간 부두별 입·출항 신고 집계. port_calls는 "현재 정박 중" 선박 스냅샷이라
-- 출항한 배가 아예 담기지 않으므로(event도 전부 "입항"), 입·출항 건수는
-- run-enrich.ts가 이 테이블에 따로 저장하고 지역별 혼잡도 API가 읽는다.
create table if not exists public.port_call_activity (
  berth_area_id  text primary key,                     -- seed-port berthAreas.id ('' = 부두 미매칭)
  arrivals       int not null default 0,               -- 최근 window_hours 시간 입항 신고 수
  departures     int not null default 0,               -- 최근 window_hours 시간 출항 신고 수
  window_hours   int not null default 24,
  updated_at     timestamptz not null default now()
);

-- Port-MIS 기반 혼잡도 스냅샷 (시간대별 입항 신고 밀도). run-enrich.ts가 매 실행 시 교체.
create table if not exists public.port_congestion (
  bucket_time  timestamptz primary key,               -- 시간대(정시)
  arrivals     int not null default 0,                -- 해당 시간대 입항 신고 건수
  level        double precision not null default 0,    -- 0~1 정규화 혼잡도
  updated_at   timestamptz not null default now()
);

-- 기상청 단기예보 스냅샷 (격자 nx,ny × 예보 대상 시각 단위)
create table if not exists public.weather_forecasts (
  nx          int not null,
  ny          int not null,
  fcst_at     timestamptz not null,                 -- 예보 대상 시각
  base_at     timestamptz not null,                 -- 발표 시각
  temp_c      double precision,                      -- TMP 기온(℃)
  sky         int,                                   -- SKY 1맑음 3구름많음 4흐림
  pty         int,                                   -- PTY 0없음 1비 2비/눈 3눈 4소나기
  pop         int,                                   -- POP 강수확률(%)
  precip      text,                                  -- PCP 강수량
  humidity    int,                                   -- REH 습도(%)
  wind_speed  double precision,                      -- WSD 풍속(m/s)
  wind_deg    int,                                   -- VEC 풍향(deg)
  wave_m      double precision,                      -- WAV 파고(M)
  updated_at  timestamptz not null default now(),
  primary key (nx, ny, fcst_at)
);
