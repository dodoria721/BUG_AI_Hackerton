"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CongestionForecast, RegionCongestionSeries } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import LeftRail from "@/frontend/components/LeftRail";

const muted = "#8aa0c8";
const panel = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";
const bg = "#070c18";

function congestionColor(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "#34d399";
  if (level <= medium) return "#fbbf24";
  return "#f87171";
}

function congestionLabel(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "원활";
  if (level <= medium) return "보통";
  return "혼잡";
}

const card: CSSProperties = {
  background: panel,
  backdropFilter: "blur(14px)",
  border,
  borderRadius: 14,
  padding: "16px 18px",
};

function Stat({ label, value, unit, accent }: { label: string; value: string | number; unit?: string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: ".03em" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: accent ?? "#e7ecf5", lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 12, color: muted, marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

function HourlyBars({ forecast }: { forecast: CongestionForecast["forecast"] }) {
  if (!forecast.length) {
    return <div style={{ color: muted, fontSize: 13, padding: "24px 0", textAlign: "center" }}>시간대별 데이터가 없습니다.</div>;
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
      {forecast.map((p, i) => {
        const now = Date.now();
        const isNow = Math.abs(new Date(p.time).getTime() - now) < 30 * 60 * 1000;
        const hh = new Date(p.time).toLocaleTimeString("ko-KR", { hour: "2-digit" });
        return (
          <div
            key={i}
            title={`${hh} · ${p.areaVesselCount != null ? `해역 ${p.areaVesselCount}척` : `입항 ${p.arrivals ?? 0}건`} · ${Math.round(p.level * 100)}%`}
            style={{
              flex: 1,
              height: `${Math.max(4, p.level * 100)}%`,
              borderRadius: "3px 3px 1px 1px",
              background: isNow ? "#38bdf8" : congestionColor(p.level),
              opacity: isNow ? 1 : 0.75,
            }}
          />
        );
      })}
    </div>
  );
}

export default function CongestionPage() {
  const [overall, setOverall] = useState<CongestionForecast | null>(null);
  const [regions, setRegions] = useState<RegionCongestionSeries[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [o, r] = await Promise.all([
          fetch("/api/congestion").then((x) => x.json()),
          fetch("/api/congestion/regions").then((x) => x.json()),
        ]);
        if (!alive) return;
        setOverall(o);
        setRegions(r);
        if (Array.isArray(r) && r.length) setSelectedId(r[0].id);
      } catch {
        if (alive) setError("혼잡도 데이터를 불러오지 못했습니다.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const currentAisCount = useMemo(() => {
    if (!overall) return null;
    const now = Date.now();
    let best: { d: number; v: number } | null = null;
    for (const p of overall.forecast) {
      if (p.areaVesselCount == null) continue;
      const d = Math.abs(new Date(p.time).getTime() - now);
      if (!best || d < best.d) best = { d, v: p.areaVesselCount };
    }
    return best?.v ?? null;
  }, [overall]);

  const totals = useMemo(() => {
    if (!regions) return { arrivals: 0, departures: 0 };
    return regions.reduce(
      (a, r) => ({ arrivals: a.arrivals + r.arrivals, departures: a.departures + r.departures }),
      { arrivals: 0, departures: 0 }
    );
  }, [regions]);

  const selected = useMemo(() => regions?.find((r) => r.id === selectedId) ?? null, [regions, selectedId]);
  const currentLevel = overall?.currentLevel ?? 0;
  const windowH = regions?.[0]?.activityWindowHours ?? 24;

  return (
    <div style={{ minHeight: "100vh", background: bg, color: "#e7ecf5", paddingLeft: 84 }}>
      <LeftRail active="/congestion" />

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 28px 40px" }}>
        <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "#5b8cff" }}>
          CONGESTION DETAIL
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>{BUSAN_PORT.name} 혼잡도 상세</h1>
        <p style={{ color: muted, fontSize: 13, margin: "0 0 20px" }}>
          시간대별 혼잡도는 해수부 연안AIS 통계(해역 밀도), 입항·출항 수치는 최근 {windowH}시간 Port-MIS 입출항 신고 기준입니다.
        </p>

        {error && <div style={{ ...card, borderColor: "#f8717155", color: "#fca5a5", marginBottom: 20 }}>{error}</div>}

        {/* 항만 전체 요약 */}
        <div style={{ ...card, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 800,
                color: "#0b1222",
                background: congestionColor(currentLevel),
              }}
            >
              {Math.round(currentLevel * 100)}
            </div>
            <div>
              <div style={{ fontSize: 12, color: muted, fontWeight: 700 }}>현재 혼잡도 (항만 전체)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: congestionColor(currentLevel) }}>{congestionLabel(currentLevel)}</div>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(120,160,255,0.14)" }} />
          <Stat label="현재 해역 AIS 척수" value={currentAisCount != null ? currentAisCount.toLocaleString() : "—"} unit="척" accent="#5b8cff" />
          <Stat label={`입항 신고 (${windowH}h)`} value={totals.arrivals} unit="건" />
          <Stat label={`출항 신고 (${windowH}h)`} value={totals.departures} unit="건" />
        </div>

        {/* 지역 선택 탭 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {(regions ?? []).map((r) => {
            const on = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  color: on ? "#fff" : muted,
                  background: on ? "linear-gradient(135deg,#2f6bff,#5b8cff)" : panel,
                  border: on ? "1px solid transparent" : border,
                }}
              >
                {r.name}
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: congestionColor(r.currentLevel),
                    display: "inline-block",
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* 선택 지역 상세 */}
        {selected && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{selected.name}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: congestionColor(selected.currentLevel) }}>
                  {congestionLabel(selected.currentLevel)} · {Math.round(selected.currentLevel * 100)}%
                </span>
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <Stat label={`입항 (${windowH}h)`} value={selected.arrivals} unit="건" />
                <Stat label={`출항 (${windowH}h)`} value={selected.departures} unit="건" />
                <Stat label="현재 재항(AIS)" value={selected.currentVessels} unit="척" accent="#5b8cff" />
              </div>
            </div>

            <div style={{ fontSize: 12, color: muted, fontWeight: 700, marginBottom: 8 }}>시간대별 혼잡도 (연안AIS 밀도)</div>
            <HourlyBars forecast={selected.forecast} />

            {!selected.aisSeparable && (
              <div style={{ marginTop: 14, fontSize: 11.5, color: "#fbbf24", lineHeight: 1.5 }}>
                ⚠️ 이 지역은 연안AIS 통계 격자(~10km)상 인접 항(북항·감천)과 같은 셀에 묶여, 시간대별 곡선이 서로
                유사하게 나옵니다. 입항·출항 수치는 Port-MIS 부두 매칭으로 정확히 분리됩니다.
              </div>
            )}
          </div>
        )}
        {!regions && <div style={{ ...card, color: muted }}>불러오는 중…</div>}
      </div>
    </div>
  );
}
