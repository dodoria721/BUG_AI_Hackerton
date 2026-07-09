"use client";

// 단일 선박 모니터링 콘솔 — 좌측 레일 2번(🚢)에서 진입한다.
// 실데이터: AIS(/api/ships) + Port-MIS(/api/port-calls) + 혼잡도(/api/congestion) + 기상(/api/weather).
// 조립·파생 계산은 backend/vessel/build-view.ts(순수 함수)에서 하고, 여기서는 렌더만 한다.
// 소스가 없는 항목(엔진 계기·CII 등급·태풍 트랙)은 demo-telemetry 값을 쓰되 "예시·미연동"으로 표기.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import LeftRail from "@/frontend/components/LeftRail";
import { LT } from "@/frontend/components/theme";
import {
  beaufortFromWindMs,
  CII_GRADE_BANDS,
  CII_GRADE_COLOR,
  STATUS_LABEL,
  windDir8,
} from "@/frontend/config/vessel-display";
import { BUSAN_DISPLAY_PORT, congestionDisplayColor, congestionDisplayLabel } from "@/frontend/config/ports";
import type { WeatherForecast } from "@/frontend/types/domain";
import type { TyphoonInfo, TyphoonTrackPoint } from "@/frontend/types/marine";
import type { VesselMonitorData } from "@/frontend/types/vessel";

const CiiSpeedChart = dynamic(() => import("@/frontend/components/vessel/CiiSpeedChart"), { ssr: false });

const muted = LT.muted;
const panel = LT.panelSolid;
const border = LT.border;
const ink = LT.ink;
const DASH = "—";

function congestionColor(level: number): string {
  return congestionDisplayColor(level);
}

// ── 공용 소품 ───────────────────────────────────────────────────────────
// 배지 pill (파랑/앰버/그린)
function Pill({ text, tone = "blue" }: { text: string; tone?: "blue" | "amber" | "green" }) {
  const map = {
    blue: { color: LT.blue, bg: LT.blueSoft },
    amber: { color: "#b45309", bg: "rgba(232,149,43,.14)" },
    green: { color: LT.green, bg: "rgba(22,163,74,.12)" },
  }[tone];
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, color: map.color, background: map.bg, padding: "3px 8px", borderRadius: 20, letterSpacing: ".02em" }}>{text}</span>
  );
}

function Panel({ title, badge, children, style }: { title: string; badge?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: panel, border, borderRadius: 16, padding: 16, boxShadow: LT.shadow, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: ink }}>{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

// 라벨 + 값 (테두리 없는 셀)
function Cell({ label, value, unit, accent }: { label: string; value: ReactNode; unit?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: muted, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ?? ink, lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: muted, marginLeft: 3, fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );
}

// 상단 개별 지표 카드 (Speed / DFOC / Position / Weather / Attained CII)
function StatCard({ label, children, dark, style }: { label: string; children: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minWidth: 0,
        borderRadius: 14,
        padding: "11px 14px",
        background: dark ? "#0f172a" : panel,
        border: dark ? "none" : border,
        boxShadow: LT.shadow,
        ...style,
      }}
    >
      <span style={{ fontSize: 10.5, color: dark ? "rgba(255,255,255,.6)" : muted, fontWeight: 700, letterSpacing: ".02em" }}>{label}</span>
      {children}
    </div>
  );
}

// 큰 값 + 단위
function Big({ value, unit, accent, dark }: { value: ReactNode; unit?: string; accent?: string; dark?: boolean }) {
  return (
    <span style={{ fontSize: 17, fontWeight: 800, color: accent ?? (dark ? "#fff" : ink), lineHeight: 1.1 }}>
      {value}
      {unit && <span style={{ fontSize: 10.5, color: dark ? "rgba(255,255,255,.55)" : muted, marginLeft: 2, fontWeight: 700 }}>{unit}</span>}
    </span>
  );
}

// ── 포맷 헬퍼 ───────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
function posText(lat: number, lon: number): { lat: string; lon: string } {
  return {
    lat: `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`,
    lon: `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`,
  };
}
function kst(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return DASH;
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
function latLonText(lat: number, lon: number): string {
  const latText = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
  const lonText = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
  return `${latText}, ${lonText}`;
}
function latestTyphoonPoint(typhoon: TyphoonInfo): TyphoonTrackPoint | null {
  if (typhoon.track.length === 0) return null;
  return typhoon.track.reduce((latest, point) => (point.time > latest.time ? point : latest));
}
function statusColor(status: string): string {
  if (status === "underway") return LT.green;
  if (status === "moored") return LT.blue;
  return LT.amber;
}

interface TyphoonApiResponse {
  typhoons?: TyphoonInfo[];
  error?: string;
}

async function fetchTyphoonInfo(): Promise<TyphoonApiResponse> {
  try {
    const response = await fetch("/api/marine/typhoon", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as TyphoonApiResponse | null;
    if (!response.ok) return { error: data?.error ?? "태풍정보 API 조회에 실패했습니다." };
    return { typhoons: Array.isArray(data?.typhoons) ? data.typhoons : [] };
  } catch {
    return { error: "태풍정보 API에 연결할 수 없습니다." };
  }
}

export default function VesselPage() {
  const [plannedSpeed, setPlannedSpeed] = useState(11);
  const [vesselData, setVesselData] = useState<VesselMonitorData | null>(null);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [typhoons, setTyphoons] = useState<TyphoonInfo[] | null>(null);
  const [typhoonError, setTyphoonError] = useState<string | null>(null);
  const [typhoonLoading, setTyphoonLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let active = true;
    async function load() {
      const [vessel, wx, typhoon] = await Promise.all([
        fetch("/api/vessel").then((r) => r.json()).catch(() => null),
        fetch("/api/weather").then((r) => r.json()).catch(() => null),
        fetchTyphoonInfo(),
      ]);
      if (!active) return;
      setVesselData(vessel && Array.isArray(vessel.items) ? vessel : null);
      setWeather(wx && wx.points ? wx : null);
      setTyphoons(typhoon.typhoons ?? null);
      setTyphoonError(typhoon.error ?? null);
      setTyphoonLoading(false);
      setNow(new Date());
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // 후보 목록(위치 매칭된 배 우선, 톤수 큰 순) — 상위 40척만 선택지로.
  const items = vesselData?.items ?? [];
  const selectedItem = items[selectedIdx] ?? items[0] ?? null;
  const view = selectedItem?.view ?? null;
  // CII: Required·등급경계는 IMO 표준식, Attained는 서버에서 계산한 대표 프로파일 추정값.
  const cii = selectedItem?.cii ?? null;
  const ciiCurve = selectedItem?.approachCiiCurve ?? null;

  useEffect(() => {
    if (ciiCurve) setPlannedSpeed(ciiCurve.selectedSpeedKn);
  }, [ciiCurve, selectedIdx]);

  // 현재 시각 기상(가장 가까운 예보 포인트)
  const wxPoint = useMemo(() => {
    if (!weather?.points?.length) return null;
    const t = now.getTime();
    return weather.points.reduce((a, b) => (Math.abs(new Date(b.time).getTime() - t) < Math.abs(new Date(a.time).getTime() - t) ? b : a));
  }, [weather, now]);

  const ciiCurvePoints = useMemo(() => ciiCurve?.points ?? [], [ciiCurve?.points]);
  const selectedPt = useMemo(() => {
    if (ciiCurvePoints.length === 0) return null;
    return ciiCurvePoints.reduce((a, b) => (Math.abs(b.speed - plannedSpeed) < Math.abs(a.speed - plannedSpeed) ? b : a));
  }, [ciiCurvePoints, plannedSpeed]);

  const level = vesselData?.congestion.currentLevel ?? 0;
  const pos = view?.position ? posText(view.position.lat, view.position.lon) : null;
  const bf = wxPoint?.windSpeed != null ? beaufortFromWindMs(wxPoint.windSpeed) : null;

  // 감속 권고(JIT) — 항해 중 + 위치 있는 접근 선박에만. Port-MIS 실제 선종으로 정밀 계산.
  const advisory = selectedItem?.advisory ?? null;

  return (
    <div style={{ position: "fixed", inset: 0, background: LT.pageBg, overflow: "hidden", fontFamily: "Pretendard, system-ui, sans-serif", color: ink }}>
      <LeftRail active="/vessel" />

      <div style={{ position: "absolute", top: 16, left: 84, right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        {/* ── 선박 헤더 카드 ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "14px 20px", background: panel, border, borderRadius: 16, boxShadow: LT.shadow, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, flex: "none", borderRadius: 12, background: "linear-gradient(135deg,#2f6bff,#5b8cff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🚢</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={selectedIdx}
                  onChange={(e) => setSelectedIdx(Number(e.target.value))}
                  style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", color: ink, background: "transparent", border: "none", cursor: "pointer", maxWidth: 240, outline: "none", padding: 0 }}
                >
                  {items.map((item, i) => (
                    <option key={i} value={i} style={{ background: "#fff", color: ink }}>
                      {item.label}
                    </option>
                  ))}
                  {items.length === 0 && <option>Loading...</option>}
                </select>
                {selectedItem?.hasMatchedShip && <Pill text="AIS" tone="blue" />}
              </div>
              <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginTop: 2 }}>
                {view?.type ?? DASH}
                {view?.nationality ? ` · ${view.nationality}` : ""} · IMO {view?.imo ?? DASH} · MMSI {view?.mmsi ?? DASH} · 호출부호 {view?.callSign ?? DASH}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10.5, color: muted, fontWeight: 700 }}>항해 상태</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: view ? statusColor(view.status) : muted }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: view ? statusColor(view.status) : muted, display: "inline-block" }} />
              {view ? STATUS_LABEL[view.status] : DASH}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, color: muted, fontWeight: 700 }}>항로</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: ink }}>
              {view?.fromPort ?? DASH} <span style={{ color: muted }}>→</span> <span style={{ color: LT.blue }}>{view?.toPort ?? DASH}</span>
            </span>
          </div>

          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: muted, fontWeight: 700 }}>Local Time (KST)</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: ink, marginTop: 2 }}>{kst(now.toISOString())}</div>
          </div>
        </div>

        {/* ── 지표 카드 행 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.85fr) minmax(0,.95fr) minmax(0,1.2fr) minmax(0,1.25fr) minmax(0,.95fr)", gap: 12 }}>
          <StatCard label="Speed (SOG)">
            <Big value={view?.speedKn != null ? view.speedKn.toFixed(1) : DASH} unit="kn" />
          </StatCard>
          <StatCard label="M/E DFOC*">
            <Big value={view ? view.dfocEstTonPerDay.toFixed(1) : DASH} unit="t/day" accent={LT.amber} />
          </StatCard>
          <StatCard label="Position (AIS)">
            <div style={{ fontSize: 13, fontWeight: 800, color: ink, lineHeight: 1.35 }}>
              {pos?.lat ?? DASH} {pos?.lon ?? DASH}
            </div>
          </StatCard>
          <StatCard label="Weather (항만)">
            <div style={{ fontSize: 12.5, fontWeight: 800, color: ink, lineHeight: 1.35 }}>
              B.F {bf ?? DASH} · {wxPoint?.windDeg != null ? windDir8(wxPoint.windDeg) : DASH} {wxPoint?.windSpeed ?? DASH} m/s
            </div>
            <div style={{ fontSize: 11, color: muted, fontWeight: 700 }}>파고 {wxPoint?.waveM ?? DASH}m</div>
          </StatCard>
          <StatCard label="Attained CII*" dark>
            {cii ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", width: 24, height: 24, borderRadius: 7, background: CII_GRADE_COLOR[cii.grade], color: "#fff", fontSize: 13, fontWeight: 900, alignItems: "center", justifyContent: "center" }}>
                  {cii.grade}
                </span>
                <span style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{cii.attainedCii.toFixed(2)}</span>
              </span>
            ) : (
              <Big value={DASH} dark />
            )}
          </StatCard>
        </div>

        {/* ── 패널 그리드 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
          {/* CII 현황 — Required·등급경계는 IMO 표준식, Attained는 추정 */}
          <Panel title="CII 현황" badge={<Pill text="표준식 + 추정" tone="blue" />}>
            {cii ? (
              (() => {
                const reductionPct = (1 - cii.requiredCii / cii.referenceCii) * 100;
                const lo = cii.boundaries[0] * 0.88;
                const hi = cii.boundaries[3] * 1.12;
                const markerPct = Math.max(0, Math.min(1, (cii.attainedCii - lo) / (hi - lo))) * 100;
                const over = cii.marginPct < 0;
                const gradeColor = CII_GRADE_COLOR[cii.grade];
                return (
                  <>
                    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 92, flex: "none", height: 96, borderRadius: 14, background: `${gradeColor}14`, color: gradeColor }}>
                        <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.85 }}>GRADE</span>
                        <span style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{cii.grade}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{cii.attainedCii.toFixed(3)}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, background: LT.tile, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: muted }}>REQUIRED</span>
                        <span style={{ fontSize: 30, fontWeight: 900, color: LT.blue, lineHeight: 1.1 }}>{cii.requiredCii.toFixed(3)}</span>
                        <div style={{ fontSize: 11, fontWeight: 700, color: muted, marginTop: 6 }}>
                          기준 대비 <b style={{ color: over ? LT.red : LT.green }}>{Math.abs(cii.marginPct).toFixed(1)}% {over ? "초과" : "이하"}</b>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: muted, marginTop: 2 }}>{cii.year} 감축률 {reductionPct.toFixed(0)}% 적용</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: muted, fontWeight: 700, marginBottom: 6 }}>Rating (A → E)</div>
                    <div style={{ position: "relative", height: 8, borderRadius: 4, background: "linear-gradient(90deg,#22c55e,#84cc16,#eab308,#f97316,#ef4444)" }}>
                      <div style={{ position: "absolute", top: -3, left: `${markerPct}%`, width: 3, height: 14, borderRadius: 2, background: ink, boxShadow: "0 0 0 2px #fff" }} />
                    </div>
                    <div style={{ fontSize: 9.5, color: muted, marginTop: 10, lineHeight: 1.5 }}>
                      Required·등급경계 = IMO MEPC.353/354 표준식 · Attained* = 대표 프로파일 추정
                      <br />
                      capacity = {Math.round(cii.dwtEstimate).toLocaleString()}t · GT 기반 DWT 근사
                    </div>
                  </>
                );
              })()
            ) : (
              <div style={{ fontSize: 11.5, color: muted, padding: "24px 4px", lineHeight: 1.6 }}>
                선종이 CII 분류에 해당하지 않거나 총톤수(GT) 정보가 없어 계산할 수 없습니다.
              </div>
            )}
          </Panel>

          {/* 선석 대기 예측 (실데이터) */}
          <Panel title="선석 대기 예측" badge={vesselData ? <span style={{ fontSize: 10, fontWeight: 800, color: LT.green }}>● 실시간</span> : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800 }}>
              <span style={{ color: ink }}>{view?.fromPort ?? DASH}</span>
              <span style={{ color: LT.blue }}>{view?.toPort ?? DASH}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: muted, margin: "3px 0 10px" }}>
              <span>{view ? STATUS_LABEL[view.status] : DASH}</span>
              <span>{view?.berthName ?? ""}</span>
            </div>
            <div style={{ height: 1, background: LT.borderColor, marginBottom: 12 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 8px" }}>
              <Cell label="현재 속도 (SOG)" value={view?.speedKn != null ? view.speedKn.toFixed(1) : DASH} unit="kn" />
              <Cell label="예상 ETA" value={view?.etaIso && view.status === "underway" ? kst(view.etaIso) : DASH} />
              <Cell label="잔여 소요시간" value={view?.remainingHours != null ? view.remainingHours.toFixed(1) : DASH} unit="h" />
              <Cell label="혼잡도" value={`${Math.round(level * 100)}`} unit="%" accent={congestionColor(level)} />
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: `${congestionColor(level)}12` }}>
              <div style={{ fontSize: 11, color: muted, fontWeight: 700, marginBottom: 3 }}>현재 항만 혼잡 단계</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: congestionColor(level) }}>{congestionDisplayLabel(level)}</div>
            </div>
          </Panel>

          {/* 연료 소모 추정 (fuel.ts 모델) */}
          <Panel title="연료 소모 추정" badge={<Pill text="모델 추정" tone="blue" />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 10px" }}>
              <Cell label="연료 종류" value={view?.fuelType ?? DASH} accent={LT.blue} />
              <Cell label="총톤수 (GT)" value={view?.grossTonnage != null ? fmt(view.grossTonnage) : DASH} />
              <Cell label="시간당 (추정)" value={view ? Math.round(view.fuelRateTonPerHour * 1000).toString() : DASH} unit="kg/h" />
              <Cell label="일일 (추정)" value={view ? view.dfocEstTonPerDay.toFixed(1) : DASH} unit="t/day" accent={LT.amber} />
            </div>
            <div style={{ fontSize: 10, color: muted, marginTop: 12 }}>선종·톤수 기반 정박(hoteling) 소모 추정 · IMO GHG 기준</div>
          </Panel>

          {/* 속도별 탄소배출 효율 분석 (모델 곡선 + 실측 기상) */}
          <Panel title="속도별 탄소배출 효율 분석" style={{ gridColumn: "span 3" }} badge={<Pill text="시뮬레이션" tone="blue" />}>
            <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              {CII_GRADE_BANDS.map((b) => (
                <span key={b.grade} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: LT.inkSoft }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                  {b.grade}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: muted }}>X축: 운항속도(KNOTS) · Y축: CII지수</span>
            </div>
            {ciiCurve && selectedPt ? (
              <>
                <div style={{ height: 200 }}>
                  <CiiSpeedChart data={ciiCurvePoints} selectedPoint={selectedPt} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "10px", marginTop: 10 }}>
                  <Cell label="접근 거리" value={ciiCurve.distanceNm.toFixed(1)} unit="NM" accent={LT.blue} />
                  <Cell label="DWT 기준" value={Math.round(ciiCurve.capacityTonnage).toLocaleString("ko-KR")} unit="t" />
                  <Cell label="연료" value={ciiCurve.fuelType} accent={LT.green} />
                  <Cell label="선택 CII" value={selectedPt.cii.toFixed(3)} accent="#d97706" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: muted, whiteSpace: "nowrap" }}>속도별 접근구간 CII</span>
                    <input
                      type="range"
                      min={ciiCurvePoints[0]?.speed ?? 4}
                      max={ciiCurvePoints[ciiCurvePoints.length - 1]?.speed ?? 24}
                      step={0.5}
                      value={plannedSpeed}
                      onChange={(e) => setPlannedSpeed(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#f59e0b" }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 900, color: "#d97706", minWidth: 48, textAlign: "right" }}>{plannedSpeed.toFixed(1)}kn</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: muted }}>풍향 {wxPoint?.windDeg != null ? windDir8(wxPoint.windDeg) : DASH} {wxPoint?.windSpeed ?? DASH} m/s · BF {bf ?? DASH}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: muted }}>파고 유의파고 {wxPoint?.waveM ?? DASH}m</span>
                </div>
                <div style={{ fontSize: 10, color: muted, marginTop: 10, lineHeight: 1.5 }}>
                  {ciiCurve.capacitySource === "vessel-spec-dwt" ? "선박 제원 DWT 매칭값" : "GT 기반 DWT 추정값"} · {ciiCurve.note}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: muted, padding: "28px 4px", lineHeight: 1.6 }}>
                AIS 현재 위치·속도와 DWT/GT 기준값이 모두 있어야 접근구간 추정 CII를 계산할 수 있습니다.
                <br />
                현재 선택 선박은 필요한 실제 데이터가 부족해 속도별 곡선을 표시하지 않습니다.
              </div>
            )}
          </Panel>

          {/* 태풍 모니터링 (기상청 태풍정보 API) */}
          <Panel
            title="태풍 모니터링"
            badge={typhoonLoading ? <Pill text="조회 중" tone="blue" /> : typhoonError ? <Pill text="연동 확인" tone="amber" /> : <Pill text="기상청 API" tone="green" />}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {typhoonLoading ? (
                <div style={{ fontSize: 12, color: muted, padding: "18px 4px", lineHeight: 1.6 }}>기상청 태풍정보를 불러오는 중입니다.</div>
              ) : typhoonError ? (
                <div style={{ fontSize: 12, color: muted, padding: "18px 4px", lineHeight: 1.6 }}>
                  <b style={{ color: LT.amber }}>태풍정보 API를 연결하지 못했습니다.</b>
                  <br />
                  {typhoonError}
                  <br />
                  .env.local의 KMA_TYPHOON_KEY 설정을 확인하면 실제 태풍정보로 표시됩니다.
                </div>
              ) : !typhoons || typhoons.length === 0 ? (
                <div style={{ fontSize: 12, color: muted, padding: "18px 4px", lineHeight: 1.6 }}>
                  <b style={{ color: LT.green }}>최근 3일 발표 기준 활성 태풍 정보가 없습니다.</b>
                  <br />
                  기상청 태풍정보 조회서비스 응답을 기준으로 표시합니다.
                </div>
              ) : (
                typhoons.map((typhoon, i) => {
                  const point = latestTyphoonPoint(typhoon);
                  return (
                    <div key={typhoon.typhoonId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? `1px solid ${LT.borderColor}` : "none" }}>
                      <div style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", background: LT.blueSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌀</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: ink }}>
                          {typhoon.nameKr ? `${typhoon.nameKr} (${typhoon.name})` : typhoon.name}
                        </div>
                        <div style={{ fontSize: 11, color: LT.red, fontWeight: 700, marginTop: 2 }}>
                          {point ? latLonText(point.lat, point.lon) : "좌표 없음"} · {typhoon.status}
                        </div>
                        <div style={{ fontSize: 10.5, color: muted, fontWeight: 700, marginTop: 2 }}>
                          {point?.maxWindSpeedMs != null ? `최대풍속 ${point.maxWindSpeedMs}m/s` : "최대풍속 -"}
                          {" · "}
                          {point?.centralPressureHpa != null ? `중심기압 ${point.centralPressureHpa}hPa` : "중심기압 -"}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: muted, fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" }}>
                        {point ? kst(point.time) : DASH}
                        <br />
                        <span style={{ fontSize: 10, color: point?.forecast ? LT.amber : LT.green }}>{point?.forecast ? "예보" : "실황"}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          {/* 감속 권고 (JIT 정시도착) — 이 선박 전용, Port-MIS 실제 선종 반영 */}
          <Panel title="감속 권고 · JIT 정시도착" style={{ gridColumn: "span 4" }} badge={<Pill text="연료·CO₂ 저감" tone="green" />}>
            {advisory ? (
              advisory.savings.fuelTon > 0 ? (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {/* 권고 요약 */}
                  <div style={{ flex: "1 1 280px", background: "linear-gradient(135deg,#2f6bff,#5b8cff)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", color: "#fff", boxShadow: "0 10px 24px rgba(47,107,255,.24)" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.9 }}>권고 감속 속도</div>
                    <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
                      {view?.speedKn?.toFixed(0)} → {advisory.recommendedSpeedKn}
                      <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginLeft: 4 }}>kn</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.92, marginTop: 4 }}>
                      도착을 {advisory.etaDelayHours}h 늦춰 묘박 대기 {advisory.waitHoursIfFullSpeed}h를 항해로 흡수
                    </div>
                  </div>
                  {/* 절감·비교 */}
                  <div style={{ flex: "2 1 420px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px 10px", alignContent: "center" }}>
                    <Cell label="연료 절감" value={advisory.savings.fuelTon.toFixed(1)} unit="t" accent={LT.blue} />
                    <Cell label="CO₂ 감축" value={advisory.savings.co2Ton.toFixed(1)} unit="t" accent={LT.green} />
                    <Cell label="연료비 절감" value={`$${advisory.savings.fuelCostUsd.toLocaleString()}`} accent="#7c3aed" />
                    <Cell label="혼잡도" value={Math.round(level * 100)} unit="%" accent={congestionColor(level)} />
                    <Cell label="전속안 총연료" value={advisory.baseline.totalTon.toFixed(1)} unit="t" />
                    <Cell label="JIT안 총연료" value={advisory.jit.totalTon.toFixed(1)} unit="t" accent={LT.green} />
                    <Cell label="전속 시 대기" value={advisory.waitHoursIfFullSpeed} unit="h" />
                    <Cell label="ETA 지연" value={advisory.etaDelayHours} unit="h" />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: muted, padding: "16px 4px", lineHeight: 1.6 }}>
                  현재 항만이 원활해 감속 이득이 없습니다 — 현 속력 {view?.speedKn?.toFixed(1)}kn 유지 권고. 혼잡도가 오르면 최적 감속 속도와 절감량을 계산합니다.
                </div>
              )
            ) : (
              <div style={{ fontSize: 12, color: muted, padding: "16px 4px", lineHeight: 1.6 }}>
                JIT 감속 권고는 <b style={{ color: LT.inkSoft }}>항해 중 접근 선박</b>에만 적용됩니다.
                {view ? ` (현재 상태: ${STATUS_LABEL[view.status]}${!view.position ? " · AIS 위치 없음" : ""})` : ""}
              </div>
            )}
            <div style={{ fontSize: 9.5, color: muted, marginTop: 12 }}>
              2019~2024 부산항 입출항 실측(대기시간) · 선종 <b style={{ color: LT.inkSoft }}>{view?.type ?? DASH}</b> 기준 · 전속 후 묘박대기 대비 (v³ 감속 법칙)
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
