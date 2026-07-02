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
  updated_at            timestamptz not null default now()
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
