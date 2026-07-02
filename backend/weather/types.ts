// 기상청 단기예보 도메인 타입.

export interface WeatherPoint {
  time: string; // 예보 대상 시각 (ISO 8601)
  tempC?: number; // TMP 1시간 기온(℃)
  sky?: number; // SKY 하늘상태 (1 맑음, 3 구름많음, 4 흐림)
  pty?: number; // PTY 강수형태 (0 없음, 1 비, 2 비/눈, 3 눈, 4 소나기)
  pop?: number; // POP 강수확률(%)
  precip?: string; // PCP 1시간 강수량 (예: "강수없음", "1.0mm")
  humidity?: number; // REH 습도(%)
  windSpeed?: number; // WSD 풍속(m/s)
  windDeg?: number; // VEC 풍향(deg)
  waveM?: number; // WAV 파고(M) — 항만 운영에 중요
}

export interface WeatherForecast {
  port: string;
  baseTime: string; // 발표 시각 (ISO 8601)
  grid: { nx: number; ny: number };
  points: WeatherPoint[]; // 시간순 예보
}
