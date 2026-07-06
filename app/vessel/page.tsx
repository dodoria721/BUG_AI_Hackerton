"use client";

// 단일 선박 모니터링 콘솔 — 좌측 레일 2번(🚢)에서 진입한다.
// 실데이터: AIS(/api/ships) + Port-MIS(/api/port-calls) + 혼잡도(/api/congestion) + 기상(/api/weather).
// 조립·파생 계산은 backend/vessel/build-view.ts(순수 함수)에서 하고, 여기서는 렌더만 한다.
// 소스가 없는 항목(엔진 계기·CII 등급·태풍 트랙)은 demo-telemetry 값을 쓰되 "예시·미연동"으로 표기.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ResponsiveContainer } from "recharts";
import LeftRail from "@/frontend/components/LeftRail";
import type { CongestionForecast, PortCall, Ship } from "@/backend/ports/port-types";
import type { WeatherForecast } from "@/backend/weather/types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import {
  monitorCandidates,
  buildVesselView,
  beaufortFromWindMs,
  windDir8,
  congestionLabel,
  STATUS_LABEL,
  type VesselCandidate,
} from "@/backend/vessel/build-view";
import { DEMO_ENGINE, DEMO_TYPHOON, CII_GRADE_BANDS, ciiCurveBySpeed } from "@/backend/vessel/demo-telemetry";
import { computeCiiStatus, CII_GRADE_COLOR } from "@/backend/prediction/cii";
import { haversineDistanceKm } from "@/backend/prediction/eta";
import { recommendSpeed } from "@/backend/prediction/speed-advisory";

const muted = "#8aa0c8";
const panelBg = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";
const text = "#e7ecf5";
const DASH = "—";

function congestionColor(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "#34d399";
  if (level <= medium) return "#fbbf24";
  return "#f87171";
}

// ── 공용 소품 ───────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,.1)" }} />;
}

// "소스 없음" 표기 배지
function MockBadge({ label = "예시 · 미연동" }: { label?: string }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", background: "rgba(251,191,36,.12)", padding: "3px 8px", borderRadius: 20, letterSpacing: ".02em" }}>
      {label}
    </span>
  );
}

function TopStat({ label, value, unit, accent }: { label: string; value: ReactNode; unit?: string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 54 }}>
      <span style={{ fontSize: 10, color: muted, fontWeight: 700, letterSpacing: ".03em" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: accent ?? text, lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 10.5, color: muted, marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

function Panel({ title, badge, children, style }: { title: string; badge?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: panelBg, backdropFilter: "blur(14px)", border, borderRadius: 14, padding: 14, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".02em", color: text }}>{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Cell({ label, value, unit, accent }: { label: string; value: ReactNode; unit?: string; accent?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,.05)" }}>
      <div style={{ fontSize: 10, color: muted, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ?? text, lineHeight: 1.1 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: muted, marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

const TABS = ["대시보드", "엔진", "항차별 성과", "CII", "CII 시뮬레이션", "선석대기예측", "ESD & EU ETS"];

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

export default function VesselPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [plannedSpeed, setPlannedSpeed] = useState(11);
  const [ships, setShips] = useState<Ship[]>([]);
  const [portCalls, setPortCalls] = useState<PortCall[]>([]);
  const [congestion, setCongestion] = useState<CongestionForecast | null>(null);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let active = true;
    async function load() {
      const [s, pc, cg, wx] = await Promise.all([
        fetch("/api/ships").then((r) => r.json()).catch(() => []),
        fetch("/api/port-calls").then((r) => r.json()).catch(() => []),
        fetch("/api/congestion").then((r) => r.json()).catch(() => null),
        fetch("/api/weather").then((r) => r.json()).catch(() => null),
      ]);
      if (!active) return;
      setShips(Array.isArray(s) ? s : []);
      setPortCalls(Array.isArray(pc) ? pc : []);
      setCongestion(cg && cg.forecast ? cg : null);
      setWeather(wx && wx.points ? wx : null);
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
  const candidates = useMemo<VesselCandidate[]>(() => monitorCandidates(ships, portCalls).slice(0, 40), [ships, portCalls]);
  const candidate = candidates[selectedIdx] ?? candidates[0];
  const view = useMemo(() => buildVesselView(candidate, now), [candidate, now]);
  // CII: Required·등급경계는 IMO 표준식, Attained는 대표 프로파일 추정 (backend/prediction/cii.ts)
  const cii = useMemo(
    () => (view ? computeCiiStatus(view.type ?? undefined, view.grossTonnage ?? undefined, now.getFullYear()) : null),
    [view, now]
  );

  // 현재 시각 기상(가장 가까운 예보 포인트)
  const wxPoint = useMemo(() => {
    if (!weather?.points?.length) return null;
    const t = now.getTime();
    return weather.points.reduce((a, b) => (Math.abs(new Date(b.time).getTime() - t) < Math.abs(new Date(a.time).getTime() - t) ? b : a));
  }, [weather, now]);

  const curve = useMemo(() => ciiCurveBySpeed(8, 13, 0.5), []);
  const selectedPt = useMemo(
    () => curve.reduce((a, b) => (Math.abs(b.speed - plannedSpeed) < Math.abs(a.speed - plannedSpeed) ? b : a)),
    [curve, plannedSpeed]
  );

  const level = congestion?.currentLevel ?? 0;
  const pos = view?.position ? posText(view.position.lat, view.position.lon) : null;
  const bf = wxPoint?.windSpeed != null ? beaufortFromWindMs(wxPoint.windSpeed) : null;

  // 감속 권고(JIT) — 항해 중 + 위치 있는 접근 선박에만. Port-MIS 실제 선종으로 정밀 계산.
  const advisory = (() => {
    if (!view || view.status !== "underway" || !view.position || view.speedKn == null || view.speedKn < 1) return null;
    const distanceNm = haversineDistanceKm(view.position, BUSAN_PORT.center) / 1.852;
    if (distanceNm < 5 || distanceNm > 800) return null; // 너무 가깝거나(입항 임박) 먼(무의미) 경우 제외
    const inPortEquiv = level * BUSAN_PORT.portCallCapacity.portWide.p99; // 혼잡도 → 동시 재항 척수 환산
    return recommendSpeed(
      { vesselType: view.type ?? undefined, grossTonnage: view.grossTonnage ?? undefined, distanceNm, currentSpeedKn: view.speedKn, currentInPort: inPortEquiv },
      BUSAN_PORT
    );
  })();

  return (
    <div style={{ position: "fixed", inset: 0, background: "#070c17", overflow: "hidden", fontFamily: "Pretendard, system-ui, sans-serif", color: text }}>
      <LeftRail active="/vessel" />

      <div style={{ position: "absolute", top: 16, left: 84, right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        {/* ── 상단 선박 정보 바 ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", background: panelBg, backdropFilter: "blur(14px)", border, borderRadius: 14, flexWrap: "wrap" }}>
          {/* 선박 식별 + 선택 */}
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#2f6bff,#5b8cff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🚢</div>
            <div>
              <select
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(Number(e.target.value))}
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-.01em", color: text, background: "transparent", border: "none", cursor: "pointer", maxWidth: 220, outline: "none" }}
              >
                {candidates.map((c, i) => (
                  <option key={i} value={i} style={{ background: "#0b1222", color: text }}>
                    {c.call.vesselName}{c.ship ? " ⚓" : ""}
                  </option>
                ))}
                {candidates.length === 0 && <option>불러오는 중…</option>}
              </select>
              <div style={{ fontSize: 10.5, color: muted, fontWeight: 700 }}>{view?.type ?? DASH}{view?.nationality ? ` · ${view.nationality}` : ""}</div>
              <div style={{ fontSize: 10, color: muted, marginTop: 1 }}>
                IMO {view?.imo ?? DASH} · MMSI {view?.mmsi ?? DASH} · 호출부호 {view?.callSign ?? DASH}
              </div>
            </div>
          </div>
          <Divider />
          {/* 항로 + 상태 */}
          <div style={{ minWidth: 190 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800 }}>
              <span>🏳️ {view?.fromPort ?? DASH}</span>
              <span>{view?.toPort ?? DASH} 🚩</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: muted, margin: "2px 0 6px" }}>
              <span>직전 출항항</span>
              <span>다음 기항지</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 20, color: view?.status === "underway" ? "#38bdf8" : view?.status === "moored" ? "#34d399" : "#fbbf24", background: "rgba(255,255,255,.06)" }}>
                {view ? STATUS_LABEL[view.status] : DASH}
              </span>
              <span style={{ fontSize: 9.5, color: muted }}>입항신고 {kst(view?.arrivalTimeIso ?? null)}</span>
            </div>
          </div>
          <Divider />
          <TopStat label="🛟 Speed (SOG)" value={view?.speedKn != null ? view.speedKn.toFixed(1) : DASH} unit="kn" />
          <TopStat label="M/E DFOC*" value={view ? view.dfocEstTonPerDay.toFixed(1) : DASH} unit="t/day" accent="#fbbf24" />
          <TopStat label="RPM" value={DASH} />
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, color: muted, fontWeight: 700 }}>📍 Position (AIS)</span>
            <span style={{ fontSize: 12, fontWeight: 800 }}>{pos?.lat ?? DASH}</span>
            <span style={{ fontSize: 12, fontWeight: 800 }}>{pos?.lon ?? DASH}</span>
          </div>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, color: muted, fontWeight: 700 }}>🌊 Weather (항만)</span>
            <span style={{ fontSize: 12, fontWeight: 800 }}>
              B.F {bf ?? DASH} · WS {wxPoint?.windSpeed ?? DASH} m/s
            </span>
            <span style={{ fontSize: 12, fontWeight: 800 }}>WD {wxPoint?.windDeg != null ? windDir8(wxPoint.windDeg) : DASH} · 파고 {wxPoint?.waveM ?? DASH}m</span>
          </div>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: muted, fontWeight: 700 }}>Attained CII*</span>
            {cii ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 6, background: CII_GRADE_COLOR[cii.grade], color: "#0b1222", fontSize: 12, fontWeight: 900, alignItems: "center", justifyContent: "center" }}>
                  {cii.grade}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{cii.attainedCii.toFixed(2)}</span>
              </span>
            ) : (
              <span style={{ fontSize: 15, fontWeight: 800, color: muted }}>{DASH}</span>
            )}
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 10, color: muted }}>
            <div>🕒 Local Time (Seoul, KST)</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: text, marginTop: 2 }}>{kst(now.toISOString())}</div>
          </div>
        </div>

        {/* ── 탭 ── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {TABS.map((t, i) => {
            const on = i === activeTab;
            return (
              <button key={t} type="button" onClick={() => setActiveTab(i)}
                style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 800, borderRadius: 9, cursor: "pointer", border: on ? "1px solid rgba(120,160,255,.35)" : "1px solid transparent", color: on ? "#fff" : muted, background: on ? "rgba(56,120,255,.16)" : "transparent" }}>
                {t}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 10, color: muted }}>* 표시된 값 중 <b style={{ color: "#fbbf24" }}>노란색/미연동</b>은 모델 추정 또는 미연동 항목</span>
        </div>

        {/* ── 패널 그리드 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
          {/* CII 현황 — Required·등급경계는 IMO 표준식, Attained는 추정 */}
          <Panel
            title="CII 현황"
            badge={<span style={{ fontSize: 9, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,.12)", padding: "3px 8px", borderRadius: 20 }}>표준식 + 추정</span>}
          >
            {cii ? (
              (() => {
                const reductionPct = (1 - cii.requiredCii / cii.referenceCii) * 100;
                const lo = cii.boundaries[0] * 0.88;
                const hi = cii.boundaries[3] * 1.12;
                const markerPct = Math.max(0, Math.min(1, (cii.attainedCii - lo) / (hi - lo))) * 100;
                const over = cii.marginPct < 0;
                return (
                  <>
                    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 92, height: 92, borderRadius: 14, background: CII_GRADE_COLOR[cii.grade], color: "#0b1222" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.8 }}>GRADE</span>
                        <span style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{cii.grade}</span>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{cii.attainedCii.toFixed(3)}</span>
                        <span style={{ fontSize: 8, fontWeight: 800, opacity: 0.8 }}>ATTAINED*</span>
                      </div>
                      <div style={{ flex: 1, background: "linear-gradient(135deg,#2f6bff,#5b8cff)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.9 }}>REQUIRED</span>
                          <span style={{ fontSize: 20, fontWeight: 900 }}>{cii.requiredCii.toFixed(3)}</span>
                        </div>
                        <div style={{ height: 1, background: "rgba(255,255,255,.25)", margin: "8px 0" }} />
                        <div style={{ fontSize: 10.5, fontWeight: 700 }}>· 기준 대비 {Math.abs(cii.marginPct).toFixed(1)}% {over ? "초과" : "이하"}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.92 }}>· {cii.year}년 감축률 {reductionPct.toFixed(0)}% 적용</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: muted, fontWeight: 700, marginBottom: 5 }}>Rating (A → E)</div>
                    <div style={{ position: "relative", height: 8, borderRadius: 4, background: "linear-gradient(90deg,#22c55e,#84cc16,#eab308,#f97316,#ef4444)" }}>
                      <div style={{ position: "absolute", top: -3, left: `${markerPct}%`, width: 3, height: 14, borderRadius: 2, background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.4)" }} />
                    </div>
                    <div style={{ fontSize: 9, color: muted, marginTop: 8, lineHeight: 1.5 }}>
                      Required·등급경계 = IMO MEPC.353/354 표준식 · Attained* = 대표 프로파일 추정<br />
                      capacity = {Math.round(cii.dwtEstimate).toLocaleString()}t (GT 기반 DWT 근사)
                    </div>
                  </>
                );
              })()
            ) : (
              <div style={{ fontSize: 11, color: muted, padding: "24px 4px", lineHeight: 1.6 }}>
                선종이 CII 분류에 해당하지 않거나 총톤수(GT) 정보가 없어 계산할 수 없습니다.
              </div>
            )}
          </Panel>

          {/* 선석 대기 예측 (실데이터) */}
          <Panel title="선석 대기 예측" badge={congestion ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#34d399" }}>● 실시간</span> : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800 }}>
              <span>{view?.fromPort ?? DASH}</span>
              <span>{view?.toPort ?? DASH}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: muted, margin: "3px 0 10px" }}>
              <span>{view ? STATUS_LABEL[view.status] : DASH}</span>
              <span>{view?.berthName ?? ""}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Cell label="현재 속도 (SOG)" value={view?.speedKn != null ? view.speedKn.toFixed(1) : DASH} unit="kn" />
              <Cell label="예상 ETA" value={view?.etaIso && view.status === "underway" ? kst(view.etaIso) : DASH} />
              <Cell label="잔여 소요시간" value={view?.remainingHours != null ? view.remainingHours.toFixed(1) : DASH} unit="h" />
              <Cell label="혼잡도" value={`${Math.round(level * 100)}`} unit="%" accent={congestionColor(level)} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Cell label="현재 항만 혼잡 단계" value={congestionLabel(level, BUSAN_PORT.congestionThresholds)} accent={congestionColor(level)} />
            </div>
          </Panel>

          {/* 엔진 모니터링 (미연동 — 예시) */}
          <Panel title="엔진 모니터링" badge={<MockBadge />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, opacity: 0.6 }}>
              <Cell label="RPM" value={DEMO_ENGINE.rpm} />
              <Cell label="LOAD" value={DEMO_ENGINE.loadPct ?? DASH} unit="%" />
              <Cell label="SFOC" value={DEMO_ENGINE.sfocGkwh.toFixed(1)} unit="G/KWH" />
              <Cell label="SLIP(%)" value={DEMO_ENGINE.slipPct.toFixed(1)} unit="%" />
              <Cell label="EGT" value={DEMO_ENGINE.egtC.toFixed(1)} unit="℃" />
              <Cell label="L.O Temp" value={DEMO_ENGINE.loTempC.toFixed(1)} unit="℃" />
            </div>
            <div style={{ fontSize: 9.5, color: muted, marginTop: 8 }}>선박 엔진 센서(IoT) 연동 시 실측 표시</div>
          </Panel>

          {/* 연료 소모 추정 (fuel.ts 모델) */}
          <Panel title="연료 소모 추정" badge={<span style={{ fontSize: 9, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,.12)", padding: "3px 8px", borderRadius: 20 }}>모델 추정</span>}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <Cell label="연료 종류" value={view?.fuelType ?? DASH} accent="#38bdf8" />
              <Cell label="총톤수 (GT)" value={view?.grossTonnage != null ? fmt(view.grossTonnage) : DASH} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Cell label="시간당 (추정)" value={view ? Math.round(view.fuelRateTonPerHour * 1000).toString() : DASH} unit="kg/h" accent="#fbbf24" />
              <Cell label="일일 (추정)" value={view ? view.dfocEstTonPerDay.toFixed(1) : DASH} unit="t/day" accent="#fbbf24" />
            </div>
            <div style={{ fontSize: 9.5, color: muted, marginTop: 8 }}>선종·톤수 기반 정박(hoteling) 소모 추정 · IMO GHG 기준</div>
          </Panel>

          {/* 속도별 탄소배출 효율 분석 (모델 곡선 + 실측 기상) */}
          <Panel title="속도별 탄소배출 효율 분석" style={{ gridColumn: "span 3" }} badge={<span style={{ fontSize: 9, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,.12)", padding: "3px 8px", borderRadius: 20 }}>시뮬레이션</span>}>
            <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
              {CII_GRADE_BANDS.map((b) => (
                <span key={b.grade} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: muted }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                  {b.grade}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: muted }}>X축: 운항속도(KNOTS) · Y축: CII지수</span>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="speed" tick={{ fill: muted, fontSize: 10 }} stroke="rgba(255,255,255,.15)" />
                  <YAxis tick={{ fill: muted, fontSize: 10 }} stroke="rgba(255,255,255,.15)" domain={[1, 3]} />
                  <Tooltip contentStyle={{ background: "rgba(11,18,34,.95)", border, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: muted }} formatter={(val: number) => [val.toFixed(3), "CII"]} labelFormatter={(l) => `${l} kn`} />
                  <Line type="monotone" dataKey="cii" stroke="#facc15" strokeWidth={2.5} dot={false} />
                  <ReferenceDot x={selectedPt.speed} y={selectedPt.cii} r={6} fill="#facc15" stroke="#070c17" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: muted, whiteSpace: "nowrap" }}>🚀 운항 속도 일정</span>
                <input type="range" min={8} max={13} step={0.5} value={plannedSpeed} onChange={(e) => setPlannedSpeed(Number(e.target.value))} style={{ flex: 1, accentColor: "#facc15" }} />
                <span style={{ fontSize: 14, fontWeight: 900, color: "#facc15", minWidth: 28, textAlign: "right" }}>{plannedSpeed}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: muted }}>🧭 {wxPoint?.windDeg != null ? windDir8(wxPoint.windDeg) : DASH} {wxPoint?.windSpeed ?? DASH} m/s · BF {bf ?? DASH}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: muted }}>📏 유의파고 {wxPoint?.waveM ?? DASH}m</span>
            </div>
          </Panel>

          {/* 태풍 모니터링 (미연동 — 예시) */}
          <Panel title="태풍 모니터링" badge={<MockBadge />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.6 }}>
              {DEMO_TYPHOON.map((p, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{p.name}</span>
                    <span style={{ fontSize: 14 }}>🌀</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: muted, marginTop: 2 }}>📍 {p.latText}, {p.lonText}</div>
                  <div style={{ fontSize: 9.5, color: muted, marginTop: 1 }}>🕒 {p.timeUtc} (UTC)</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* 감속 권고 (JIT 정시도착) — 이 선박 전용, Port-MIS 실제 선종 반영 */}
          <Panel
            title="감속 권고 · JIT 정시도착"
            style={{ gridColumn: "span 4" }}
            badge={<span style={{ fontSize: 9, fontWeight: 800, color: "#34d399", background: "rgba(52,211,153,.12)", padding: "3px 8px", borderRadius: 20 }}>연료·CO₂ 저감</span>}
          >
            {advisory ? (
              advisory.savings.fuelTon > 0 ? (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {/* 권고 요약 */}
                  <div style={{ flex: "1 1 280px", background: "linear-gradient(135deg,#2f6bff,#5b8cff)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                  <div style={{ flex: "2 1 420px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, alignContent: "center" }}>
                    <Cell label="연료 절감" value={advisory.savings.fuelTon.toFixed(1)} unit="t" accent="#38bdf8" />
                    <Cell label="CO₂ 감축" value={advisory.savings.co2Ton.toFixed(1)} unit="t" accent="#34d399" />
                    <Cell label="연료비 절감" value={`$${advisory.savings.fuelCostUsd.toLocaleString()}`} accent="#a78bfa" />
                    <Cell label="혼잡도" value={Math.round(level * 100)} unit="%" accent={congestionColor(level)} />
                    <Cell label="전속안 총연료" value={advisory.baseline.totalTon.toFixed(1)} unit="t" />
                    <Cell label="JIT안 총연료" value={advisory.jit.totalTon.toFixed(1)} unit="t" accent="#34d399" />
                    <Cell label="전속 시 대기" value={advisory.waitHoursIfFullSpeed} unit="h" />
                    <Cell label="ETA 지연" value={advisory.etaDelayHours} unit="h" />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: muted, padding: "16px 4px", lineHeight: 1.6 }}>
                  현재 항만이 원활해 감속 이득이 없습니다 — 현 속력 {view?.speedKn?.toFixed(1)}kn 유지 권고. 혼잡도가 오르면 최적 감속 속도와 절감량을 계산합니다.
                </div>
              )
            ) : (
              <div style={{ fontSize: 11.5, color: muted, padding: "16px 4px", lineHeight: 1.6 }}>
                JIT 감속 권고는 <b style={{ color: "#c7d3ea" }}>항해 중 접근 선박</b>에만 적용됩니다.
                {view ? ` (현재 상태: ${STATUS_LABEL[view.status]}${!view.position ? " · AIS 위치 없음" : ""})` : ""}
              </div>
            )}
            <div style={{ fontSize: 9, color: muted, marginTop: 10 }}>
              2019~2024 부산항 입출항 실측(대기시간) · 선종 <b style={{ color: "#c7d3ea" }}>{view?.type ?? DASH}</b> 기준 · 전속 후 묘박대기 대비 (v³ 감속 법칙)
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
