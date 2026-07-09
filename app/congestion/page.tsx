"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CongestionForecast, CongestionPoint, RegionCongestionSeries } from "@/frontend/types/domain";
import { BUSAN_DISPLAY_PORT, congestionDisplayColor, congestionDisplayLabel } from "@/frontend/config/ports";
import LeftRail from "@/frontend/components/LeftRail";
import AiCongestionAnalysisCard from "@/frontend/components/congestion/AiCongestionAnalysisCard";
import { LT } from "@/frontend/components/theme";

const muted = LT.muted;
const panel = LT.panelSolid;
const border = LT.border;

function congestionColor(level: number): string {
  return congestionDisplayColor(level);
}

function congestionLabel(level: number): string {
  return congestionDisplayLabel(level);
}

// 지역 곡선의 시각(time)은 "그날 00시 UTC + KST시*1h"라 getUTCHours()가 곧 KST 시(0~23)다.
function kstHourOf(iso: string): number {
  return new Date(iso).getUTCHours();
}
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}시`;
}
function nowKstHour(): number {
  return (new Date().getUTCHours() + 9) % 24;
}

const card: CSSProperties = {
  background: panel,
  border,
  borderRadius: 16,
  padding: "18px 20px",
  boxShadow: LT.shadow,
};

function Stat({ label, value, unit, accent, align = "left" }: { label: string; value: string | number; unit?: string; accent?: string; align?: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <span style={{ fontSize: 11, color: muted, fontWeight: 700, letterSpacing: ".03em" }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: accent ?? LT.ink, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 12, color: muted, marginLeft: 3, fontWeight: 700 }}>{unit}</span>}
      </span>
    </div>
  );
}

// 범례(원활/보통/혼잡) — 상세 카드·하단에서 공유.
function Legend() {
  const items: [string, string][] = [
    [LT.green, "원활"],
    [LT.amber, "보통"],
    [LT.red, "혼잡"],
  ];
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 11.5, fontWeight: 700, color: LT.inkSoft }}>
      {items.map(([c, t]) => (
        <span key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c, display: "inline-block" }} />
          {t}
        </span>
      ))}
    </div>
  );
}

// 최고·최저·평균 등 시간대 곡선 요약치.
function summarize(forecast: CongestionPoint[]) {
  if (!forecast.length) return null;
  let max = forecast[0];
  let min = forecast[0];
  let sum = 0;
  for (const p of forecast) {
    if (p.level > max.level) max = p;
    if (p.level < min.level) min = p;
    sum += p.level;
  }
  return {
    maxPct: Math.round(max.level * 100),
    maxHour: kstHourOf(max.time),
    minPct: Math.round(min.level * 100),
    minHour: kstHourOf(min.time),
    avgPct: Math.round((sum / forecast.length) * 100),
  };
}

// 곡선 위 요약 배지 한 칸.
function Badge({ label, value, tone }: { label: string; value: string; tone: "red" | "green" | "blue" }) {
  const map = {
    red: { bg: "rgba(239,68,68,0.10)", val: LT.red },
    green: { bg: "rgba(22,163,74,0.10)", val: LT.green },
    blue: { bg: "rgba(37,99,235,0.08)", val: LT.blue },
  }[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: map.bg, fontSize: 12, fontWeight: 700, color: LT.inkSoft }}>
      {label}
      <b style={{ color: map.val, fontWeight: 800 }}>{value}</b>
    </span>
  );
}

// 선택 지역의 시간대별 혼잡도 면적 차트 — "지금" 시각을 점선+점으로 표시한다.
function RegionAreaChart({ forecast, level }: { forecast: CongestionPoint[]; level: number }) {
  const color = congestionColor(level);
  const data = useMemo(
    () =>
      [...forecast]
        .map((p) => ({ hour: kstHourOf(p.time), pct: Math.round(p.level * 100), vessels: p.areaVesselCount ?? null }))
        .sort((a, b) => a.hour - b.hour),
    [forecast]
  );

  if (!data.length) {
    return <div style={{ color: muted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>시간대별 데이터가 없습니다.</div>;
  }

  const nowHour = nowKstHour();
  const nowPoint = data.reduce((best, d) => (Math.abs(d.hour - nowHour) < Math.abs(best.hour - nowHour) ? d : best), data[0]);

  return (
    <div style={{ height: 240, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 12, left: -6, bottom: 0 }}>
          <defs>
            <linearGradient id="regionGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 24]}
            ticks={[0, 4, 8, 12, 16, 20, 24]}
            tickFormatter={hourLabel}
            tick={{ fontSize: 11, fill: muted }}
            stroke="rgba(15,23,42,0.12)"
            tickLine={false}
          />
          <YAxis domain={[0, 100]} ticks={[0, 40, 60, 100]} tick={{ fontSize: 11, fill: muted }} stroke="rgba(15,23,42,0.12)" tickLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: "rgba(15,23,42,0.18)", strokeDasharray: "3 3" }}
            formatter={(v: number, _n, item) => {
              const vc = (item?.payload as { vessels?: number | null })?.vessels;
              return [`${v}%${vc != null ? ` · 해역 ${vc}척` : ""}`, "혼잡도"];
            }}
            labelFormatter={(h: number) => hourLabel(h)}
            contentStyle={{ borderRadius: 12, border: LT.border, boxShadow: LT.shadow, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="pct" stroke={color} strokeWidth={2.5} fill="url(#regionGrad)" />
          <ReferenceLine x={nowPoint.hour} stroke={color} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: "지금", position: "top", fill: color, fontSize: 11, fontWeight: 800 }} />
          <ReferenceDot x={nowPoint.hour} y={nowPoint.pct} r={5} fill={color} stroke="#fff" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 하단 지역 비교 카드의 시간대별 막대.
function MiniBars({ forecast }: { forecast: CongestionPoint[] }) {
  if (!forecast.length) {
    return <div style={{ color: muted, fontSize: 12, padding: "18px 0", textAlign: "center" }}>데이터 없음</div>;
  }
  const nowHour = nowKstHour();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
      {[...forecast]
        .sort((a, b) => kstHourOf(a.time) - kstHourOf(b.time))
        .map((p, i) => {
          const h = kstHourOf(p.time);
          const isNow = h === nowHour;
          return (
            <div
              key={i}
              title={`${hourLabel(h)} · ${Math.round(p.level * 100)}%${p.areaVesselCount != null ? ` · 해역 ${p.areaVesselCount}척` : ""}`}
              style={{
                flex: 1,
                height: `${Math.max(6, p.level * 100)}%`,
                borderRadius: "3px 3px 1px 1px",
                background: congestionColor(p.level),
                outline: isNow ? "2px solid rgba(15,23,42,0.28)" : "none",
                outlineOffset: -1,
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
  const selectedStats = useMemo(() => (selected ? summarize(selected.forecast) : null), [selected]);
  const currentLevel = overall?.currentLevel ?? 0;
  const windowH = regions?.[0]?.activityWindowHours ?? 24;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: LT.pageBg, color: LT.ink, paddingLeft: 84, fontFamily: "Pretendard, system-ui, sans-serif" }}>
      <LeftRail active="/congestion" />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 28px 40px" }}>
        <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: LT.blue }}>CONGESTION DETAIL</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>{BUSAN_DISPLAY_PORT.name} 혼잡도 상세</h1>
        <p style={{ color: muted, fontSize: 13, margin: "0 0 20px" }}>
          시간대별 혼잡도는 해수부 연안AIS 통계(해역 밀도), 입항·출항 수치는 최근 {windowH}시간 Port-MIS 입출항 신고 기준입니다.
        </p>

        {error && <div style={{ ...card, borderColor: "rgba(239,68,68,0.35)", color: LT.red, marginBottom: 20 }}>{error}</div>}

        {/* 항만 전체 요약 */}
        <div style={{ ...card, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 800,
                color: "#fff",
                background: "#0f172a",
              }}
            >
              {Math.round(currentLevel * 100)}
            </div>
            <div>
              <div style={{ fontSize: 12, color: muted, fontWeight: 700 }}>현재 혼잡도 (항만 전체)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: congestionColor(currentLevel) }}>{congestionLabel(currentLevel)}</div>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: LT.borderColor }} />
          <Stat label="현재 해역 AIS 척수" value={currentAisCount != null ? currentAisCount.toLocaleString() : "—"} unit="척" accent={LT.blue} />
          <Stat label={`입항 신고 (${windowH}h)`} value={totals.arrivals} unit="건" />
          <Stat label={`출항 신고 (${windowH}h)`} value={totals.departures} unit="건" />
        </div>

        <AiCongestionAnalysisCard />

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
                  color: on ? "#fff" : LT.inkSoft,
                  background: on ? "linear-gradient(135deg,#2f6bff,#5b8cff)" : panel,
                  border: on ? "1px solid transparent" : border,
                  boxShadow: on ? "0 6px 16px rgba(47,107,255,.28)" : "none",
                }}
              >
                {r.name}
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: congestionColor(r.currentLevel), display: "inline-block" }} />
              </button>
            );
          })}
        </div>

        {/* 선택 지역 상세 */}
        {selected && (
          <div style={{ ...card, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 19, fontWeight: 800 }}>{selected.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: congestionColor(selected.currentLevel) }}>
                    {congestionLabel(selected.currentLevel)} · {Math.round(selected.currentLevel * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: 12, color: muted, fontWeight: 600, marginTop: 4 }}>시간대별 혼잡도 (연안 AIS 밀도) · 24시간</div>
              </div>
              <div style={{ display: "flex", gap: 22 }}>
                <Stat label={`입항 (${windowH}h)`} value={selected.arrivals} unit="건" align="right" />
                <Stat label={`출항 (${windowH}h)`} value={selected.departures} unit="건" align="right" />
                <Stat label="현재 재항(AIS)" value={selected.currentVessels} unit="척" accent={LT.blue} align="right" />
              </div>
            </div>

            {/* 요약 배지 + 범례 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedStats && (
                  <>
                    <Badge label="최고 혼잡" value={`${selectedStats.maxPct}% · ${selectedStats.maxHour}시`} tone="red" />
                    <Badge label="최저 혼잡" value={`${selectedStats.minPct}% · ${selectedStats.minHour}시`} tone="green" />
                    <Badge label="24h 평균" value={`${selectedStats.avgPct}%`} tone="blue" />
                  </>
                )}
              </div>
              <Legend />
            </div>

            <RegionAreaChart forecast={selected.forecast} level={selected.currentLevel} />

            {!selected.aisSeparable && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.18)",
                  fontSize: 11.5,
                  color: LT.inkSoft,
                  lineHeight: 1.5,
                }}
              >
                <span>⚠️</span>
                <span>
                  이 지역은 연안 AIS 통계 격자(~10km)상 인접 항(북항·감천)과 같은 셀에 묶여 시간대별 곡선이 서로 유사하게 나옵니다.
                  입항·출항 수치는 Port-MIS 부두 매칭으로 정확히 분리됩니다.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 지역별 비교 */}
        {regions && regions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {regions.map((r) => {
              const on = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    ...card,
                    textAlign: "left",
                    cursor: "pointer",
                    border: on ? `1px solid ${congestionColor(r.currentLevel)}` : border,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: muted, fontWeight: 600, marginTop: 3 }}>
                        {congestionLabel(r.currentLevel)} · 입항 {r.arrivals}건 · 출항 {r.departures}건
                      </div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: congestionColor(r.currentLevel) }}>{Math.round(r.currentLevel * 100)}%</div>
                  </div>
                  <MiniBars forecast={r.forecast} />
                </button>
              );
            })}
          </div>
        )}

        {!regions && <div style={{ ...card, color: muted }}>불러오는 중…</div>}
      </div>
    </div>
  );
}
