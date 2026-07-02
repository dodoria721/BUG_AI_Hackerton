"use client";

import { useEffect, useState } from "react";
import type { WeatherForecast, WeatherPoint } from "@/backend/weather/types";

type Kind = "clear" | "partly" | "cloudy" | "rain" | "snow" | "shower";

// 하늘상태(SKY) + 강수형태(PTY) → 조건 종류/라벨/이모지. PTY가 있으면 우선.
function condition(p: WeatherPoint): { kind: Kind; label: string; emoji: string } {
  switch (p.pty) {
    case 1:
      return { kind: "rain", label: "비", emoji: "🌧️" };
    case 2:
      return { kind: "rain", label: "비/눈", emoji: "🌨️" };
    case 3:
      return { kind: "snow", label: "눈", emoji: "❄️" };
    case 4:
      return { kind: "shower", label: "소나기", emoji: "🌦️" };
  }
  switch (p.sky) {
    case 1:
      return { kind: "clear", label: "맑음", emoji: "☀️" };
    case 3:
      return { kind: "partly", label: "구름 많음", emoji: "⛅" };
    case 4:
      return { kind: "cloudy", label: "흐림", emoji: "☁️" };
    default:
      return { kind: "partly", label: "-", emoji: "🌤️" };
  }
}

// 조건별 현재 패널 배경 (은은하게)
const PANEL_BG: Record<Kind, string> = {
  clear: "linear-gradient(135deg,#fff5e3,#fffdf6)",
  partly: "linear-gradient(135deg,#eef4ff,#f8fbff)",
  cloudy: "linear-gradient(135deg,#eef1f8,#f8fafd)",
  rain: "linear-gradient(135deg,#e6efff,#f4f8ff)",
  shower: "linear-gradient(135deg,#e6efff,#f4f8ff)",
  snow: "linear-gradient(135deg,#eef4ff,#fbfdff)",
};

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", hour12: false });
}

// 선택 패널용 상세 시각 (예: "07. 02. 18시")
function fullLabel(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
}

// 풍향(deg) → 8방위 한글
function degToCompass(deg: number): string {
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return dirs[Math.round(deg / 45) % 8];
}

const sectionLabel = {
  fontSize: 12.5,
  fontWeight: 800 as const,
  letterSpacing: ".08em",
  color: "#2f6bff",
};

const cardStyle = {
  background: "#fff",
  border: "1px solid rgba(10,24,48,.07)",
  borderRadius: 22,
  boxShadow: "0 10px 30px rgba(20,40,90,.06)",
  padding: "18px 22px",
};

export default function WeatherCard() {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "nokey" | "error">("loading");
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/weather")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 503) return setState("nokey");
        if (!res.ok) return setState("error");
        setForecast((await res.json()) as WeatherForecast);
        setState("ok");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, []);

  if (state !== "ok" || !forecast) {
    return (
      <section style={cardStyle}>
        <div style={sectionLabel}>WEATHER</div>
        <h2 style={{ margin: "6px 0 10px", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>기상 현황</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "#8a97b3", fontWeight: 600 }}>
          {state === "loading" && "기상청 예보 불러오는 중…"}
          {state === "nokey" && "기상청 서비스 키를 넣으면 실시간 예보가 표시됩니다 (.env.local · KMA_SERVICE_KEY)"}
          {state === "error" && "기상 데이터를 불러오지 못했습니다."}
        </p>
      </section>
    );
  }

  const now = Date.now();
  const future = forecast.points.filter((p) => new Date(p.time).getTime() >= now);
  const hours = future.slice(0, 24);
  // 선택된 시간대 (기본: 지금)
  const idx = Math.min(selectedIdx, hours.length - 1);
  const selected = hours[idx] ?? forecast.points[forecast.points.length - 1];

  const cond = condition(selected);
  const timeLabel = idx === 0 ? "지금" : fullLabel(selected.time);

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <div style={sectionLabel}>WEATHER</div>
          <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
            {forecast.port} 기상 현황
          </h2>
        </div>
        <div style={{ fontSize: 11.5, color: "#8a97b3", fontWeight: 600 }}>
          기상청 단기예보 · 발표 {fullLabel(forecast.baseTime)}
        </div>
      </div>

      {/* 선택된 시간대의 세부 데이터 */}
      <div
        style={{
          padding: "16px 18px",
          borderRadius: 18,
          background: PANEL_BG[cond.kind],
          border: "1px solid rgba(10,24,48,.05)",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2f6bff", marginBottom: 10 }}>{timeLabel}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 150 }}>
            <div style={{ fontSize: 48, lineHeight: 1 }}>{cond.emoji}</div>
            <div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.03em", color: "#0a1830", lineHeight: 1 }}>
                {selected.tempC ?? "-"}
                <span style={{ fontSize: 18 }}>℃</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: "#5a6785" }}>{cond.label}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginLeft: "auto" }}>
            <Metric label="파고" value={selected.waveM != null ? `${selected.waveM}` : "-"} unit="m" highlight />
            <Metric label="풍속" value={selected.windSpeed != null ? `${selected.windSpeed}` : "-"} unit="m/s" />
            <Metric
              label="풍향"
              value={selected.windDeg != null ? degToCompass(selected.windDeg) : "-"}
              unit={selected.windDeg != null ? `${selected.windDeg}°` : ""}
            />
            <Metric label="강수확률" value={selected.pop != null ? `${selected.pop}` : "-"} unit="%" />
            <Metric label="강수량" value={selected.precip ?? "-"} unit="" />
            <Metric label="습도" value={selected.humidity != null ? `${selected.humidity}` : "-"} unit="%" />
          </div>
        </div>
      </div>

      {/* 시간대 선택 — 클릭하면 위 패널이 해당 시간대로 바뀐다 */}
      <div style={{ fontSize: 11.5, color: "#8a97b3", fontWeight: 600, margin: "14px 0 6px" }}>
        시간대를 클릭하면 세부 데이터를 볼 수 있습니다
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {hours.map((p, i) => {
          const c = condition(p);
          const active = i === idx;
          return (
            <button
              key={p.time}
              onClick={() => setSelectedIdx(i)}
              style={{
                flex: "0 0 auto",
                minWidth: 62,
                textAlign: "center",
                padding: "10px 6px",
                borderRadius: 14,
                cursor: "pointer",
                fontFamily: "inherit",
                background: active ? "#eef4ff" : "#fff",
                border: active ? "1px solid rgba(47,107,255,.4)" : "1px solid rgba(10,24,48,.08)",
                boxShadow: active ? "0 4px 12px rgba(47,107,255,.14)" : "none",
                transition: "background .15s, border-color .15s",
              }}
            >
              <div style={{ fontSize: 11.5, color: active ? "#2f6bff" : "#8a97b3", fontWeight: 700 }}>
                {i === 0 ? "지금" : hourLabel(p.time)}
              </div>
              <div style={{ fontSize: 22, margin: "3px 0" }}>{c.emoji}</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0a1830" }}>{p.tempC ?? "-"}°</div>
              <div style={{ fontSize: 10.5, color: "#2f6bff", fontWeight: 700, marginTop: 1 }}>
                {p.pop != null ? `${p.pop}%` : ""}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#6b7a99", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.02em", color: highlight ? "#2f6bff" : "#0a1830" }}>
        {value}
        <span style={{ fontSize: 12, fontWeight: 700, color: "#8a97b3", marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  );
}
