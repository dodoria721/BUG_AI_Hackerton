"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type CSSProperties } from "react";
import { BUSAN_DISPLAY_PORT, SIMULATION_DESTINATION_PORTS } from "@/frontend/config/ports";
import LeftRail from "@/frontend/components/LeftRail";
import LiveShipImportModal from "@/frontend/components/simulation/LiveShipImportModal";
import RouteScenarioResults from "@/frontend/components/simulation/RouteScenarioResults";
import SimulatedShipModal from "@/frontend/components/SimulatedShipModal";
import { useRouteScenarios } from "@/frontend/hooks/useRouteScenarios";
import { useSimulatedShips } from "@/frontend/hooks/useSimulatedShips";
import { useSimulationJit } from "@/frontend/hooks/useSimulationJit";
import type { EnergyDecision } from "@/frontend/types/energy-decision";
import type { RouteScenarioMapOverlay } from "@/frontend/types/route-scenario";
import type { NewSimulatedShipInput, ScenarioShipSource, SimulatedShip } from "@/frontend/types/simulation";
import { SIMULATED_VESSEL_TYPE_LABELS } from "@/frontend/types/simulation";

const SimulationMap = dynamic(() => import("@/frontend/components/SimulationMap"), { ssr: false });

const text = "#e7ecf5";
const muted = "#8aa0c8";
const panel = "rgba(11,18,34,0.86)";
const border = "1px solid rgba(120,160,255,0.14)";

function nextDefaultName(ships: SimulatedShip[]): string {
  const maxNumber = ships.reduce((max, ship) => {
    const match = /^SIM VESSEL (\d+)$/i.exec(ship.name.trim());
    if (!match) return max;
    return Math.max(max, Number(match[1]) || 0);
  }, 0);
  return `SIM VESSEL ${String(maxNumber + 1).padStart(2, "0")}`;
}

function formatCoord(value: number): string {
  return value.toFixed(5);
}

function formatGt(value: number): string {
  return value.toLocaleString("ko-KR");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatKg(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}kg`;
}

function simulationDestinationName(destinationPortId: string | undefined): string {
  return SIMULATION_DESTINATION_PORTS.find((destination) => destination.id === destinationPortId)?.name ?? "부산항 북항";
}

function destinationBasisLabel(basis: string): string {
  if (basis === "destination-current-level") return "선택 도착지 현재 혼잡도";
  if (basis === "destination-eta-forecast-bucket") return "선택 도착지 ETA 시간대 혼잡도";
  if (basis === "global-current-level-fallback") return "전체 혼잡도 fallback";
  if (basis === "dashboard-current-level") return "dashboard-current";
  return basis;
}

function SimBadge({ source = "manual" }: { source?: ScenarioShipSource }) {
  const snapshot = source === "ais-snapshot";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 7px",
        borderRadius: 6,
        background: snapshot ? "rgba(59,130,246,.18)" : "rgba(250,204,21,.16)",
        color: snapshot ? "#bfdbfe" : "#fde68a",
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: ".06em",
      }}
    >
      {snapshot ? "LIVE SNAPSHOT" : "SIM"}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        border: "1px dashed rgba(148,163,184,.22)",
        borderRadius: 8,
        padding: "24px 14px",
        color: muted,
        fontSize: 13,
        lineHeight: 1.6,
        textAlign: "center",
      }}
    >
      생성 모드를 켠 뒤 지도에서 위치를 우클릭하면 가상 선박을 추가할 수 있습니다.
    </div>
  );
}

export default function SimulationPage() {
  const { simulatedShips, hydrated, addSimulatedShip, removeSimulatedShip, clearSimulatedShips } = useSimulatedShips();
  const [simulationMode, setSimulationMode] = useState(true);
  const [pendingPosition, setPendingPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [liveImportOpen, setLiveImportOpen] = useState(false);
  const {
    result: jitResult,
    loading: jitLoading,
    error: jitError,
    notice: jitNotice,
    runJitSimulation: requestJitSimulation,
    resetSimulationJit,
  } = useSimulationJit();
  const {
    result: routeResult,
    loading: routeLoading,
    error: routeError,
    notice: routeNotice,
    calculateRouteScenarios,
    resetRouteScenarios,
  } = useRouteScenarios();

  const defaultName = useMemo(() => nextDefaultName(simulatedShips), [simulatedShips]);
  const decisionsByShipId = useMemo(() => {
    const map = new Map<string, EnergyDecision>();
    jitResult?.decisions.forEach((decision) => {
      if (decision.shipId) map.set(decision.shipId, decision);
    });
    return map;
  }, [jitResult]);
  const routeOverlays = useMemo<RouteScenarioMapOverlay[]>(() => {
    if (!routeResult) return [];
    return routeResult.results.flatMap((shipResult) =>
      shipResult.routeScenarios
        .filter((scenario) => scenario.routePolyline.points.length >= 2)
        .map((scenario) => ({
          shipId: shipResult.shipId ?? shipResult.shipName,
          routeId: scenario.routeId,
          routeName: scenario.routeName,
          isRecommended: scenario.isRecommended,
          points: scenario.routePolyline.points,
          distanceNm: scenario.distanceNm,
          eta: scenario.eta,
          score: scenario.score,
        }))
    );
  }, [routeResult]);

  function createShip(input: NewSimulatedShipInput) {
    addSimulatedShip(input);
    setPendingPosition(null);
    setLiveImportOpen(false);
    resetSimulationJit();
    resetRouteScenarios();
  }

  function removeShip(id: string) {
    removeSimulatedShip(id);
    resetSimulationJit();
    resetRouteScenarios();
  }

  function clearAll() {
    if (simulatedShips.length === 0) return;
    clearSimulatedShips();
    resetSimulationJit();
    resetRouteScenarios();
  }

  async function runJitSimulation() {
    await requestJitSimulation(simulatedShips);
  }

  async function runRouteScenarios() {
    await calculateRouteScenarios(simulatedShips);
  }

  const shellStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    background: "#070c17",
    color: text,
    fontFamily: "Pretendard, system-ui, sans-serif",
  };

  return (
    <div style={shellStyle}>
      <LeftRail active="/simulation" />

      <div style={{ position: "absolute", inset: "16px 16px 16px 84px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(380px, 420px)", gap: 14 }}>
        <main style={{ position: "relative", minWidth: 0, border, borderRadius: 14, overflow: "hidden", background: "#0b1220" }}>
          <SimulationMap ships={simulatedShips} simulationMode={simulationMode} onMapContextMenu={setPendingPosition} routeOverlays={routeOverlays} />

          <section
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              zIndex: 500,
              width: "min(620px, calc(100% - 28px))",
              padding: 16,
              borderRadius: 12,
              border,
              background: "rgba(11,18,34,.9)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 18px 50px rgba(0,0,0,.34)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SimBadge />
                  <span style={{ color: "#38bdf8", fontSize: 11, fontWeight: 900, letterSpacing: ".08em" }}>{BUSAN_DISPLAY_PORT.name} 운영자 검토용</span>
                </div>
                <h1 style={{ margin: "8px 0 0", fontSize: 26, lineHeight: 1.15, letterSpacing: "-.01em" }}>입항 시나리오 시뮬레이션</h1>
                <p style={{ margin: "9px 0 0", color: "#c4d0ea", fontSize: 13.5, lineHeight: 1.55 }}>
                  지도 우클릭으로 가상 선박을 생성하고 위치·속도·선종·총톤수 기준의 입항 시나리오를 구성합니다.
                  이 페이지의 선박은 실제 AIS/Port-MIS 선박이 아닌 시뮬레이션용 가상 데이터입니다.
                </p>
              </div>
              <label
                style={{
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(56,189,248,.28)",
                  background: simulationMode ? "rgba(56,189,248,.14)" : "rgba(255,255,255,.04)",
                  color: simulationMode ? "#bae6fd" : muted,
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" checked={simulationMode} onChange={(event) => setSimulationMode(event.target.checked)} style={{ accentColor: "#38bdf8" }} />
                생성 모드
              </label>
            </div>

            <div style={{ marginTop: 12, padding: "9px 10px", borderRadius: 8, background: "rgba(250,204,21,.12)", color: "#fde68a", fontSize: 12, fontWeight: 800 }}>
              실제 운항 지시가 아닌 시뮬레이션 시나리오입니다. 수동 선박은 사용자가 생성한 가상 선박이며, LIVE SNAPSHOT은 실제 선박 데이터를 수정하지 않고 복사한 항목입니다.
            </div>
          </section>
        </main>

        <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 12, overflowY: "auto", paddingRight: 2 }}>
          <section style={{ padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ color: muted, fontSize: 11, fontWeight: 800, letterSpacing: ".06em" }}>SIMULATION FLEET</div>
                <div style={{ marginTop: 3, fontSize: 22, fontWeight: 900 }}>{hydrated ? simulatedShips.length : 0}척</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setLiveImportOpen(true)}
                  style={{
                    height: 34,
                    padding: "0 11px",
                    borderRadius: 8,
                    border: "1px solid rgba(56,189,248,.24)",
                    background: "rgba(56,189,248,.12)",
                    color: "#bae6fd",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  실시간 선박 불러오기
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={simulatedShips.length === 0}
                  style={{
                    height: 34,
                    padding: "0 11px",
                    borderRadius: 8,
                    border: "1px solid rgba(248,113,113,.24)",
                    background: simulatedShips.length === 0 ? "rgba(255,255,255,.03)" : "rgba(248,113,113,.1)",
                    color: simulatedShips.length === 0 ? "#55657f" : "#fecaca",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: simulatedShips.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  전체 초기화
                </button>
              </div>
            </div>
            <p style={{ margin: "10px 0 0", color: muted, fontSize: 12, lineHeight: 1.5 }}>
              저장 위치는 브라우저 localStorage입니다. Supabase ships 테이블에는 저장하지 않습니다.
              <br />
              LIVE SNAPSHOT 항목은 원본 실제 선박 데이터를 수정하지 않습니다.
            </p>
          </section>

          <section style={{ padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>JIT 계산</h2>
                <p style={{ margin: "7px 0 0", color: muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  생성한 가상 선박을 선택 도착지의 현재 Port-MIS 혼잡도와 결합해 JIT 감속 권고를 계산합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={runJitSimulation}
                disabled={jitLoading}
                style={{
                  flex: "none",
                  height: 38,
                  padding: "0 13px",
                  borderRadius: 8,
                  border: "none",
                  background: jitLoading ? "#334155" : "#38bdf8",
                  color: jitLoading ? "#94a3b8" : "#082f49",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: jitLoading ? "wait" : "pointer",
                }}
              >
                {jitLoading ? "계산 중" : "JIT 계산 실행"}
              </button>
            </div>
            {jitError && <div style={{ marginTop: 10, color: "#fecaca", fontSize: 12, fontWeight: 800 }}>{jitError}</div>}
            {jitNotice && <div style={{ marginTop: 10, color: "#fde68a", fontSize: 12, lineHeight: 1.45 }}>{jitNotice}</div>}
            {jitResult?.validation && jitResult.validation.rejectedCount > 0 && (
              <div style={{ marginTop: 10, color: "#fdba74", fontSize: 11.5, lineHeight: 1.45 }}>
                입력 검증에서 {jitResult.validation.rejectedCount}척이 제외되었습니다.
              </div>
            )}
          </section>

          <section style={{ padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>친환경 입항 경로 추천</h2>
                <p style={{ margin: "7px 0 0", color: muted, fontSize: 11.5, lineHeight: 1.45 }}>
                  선택 도착지의 사전 정의 접근 경로 후보를 거리·혼잡도·예상 대기·연료·CO₂ 기준으로 비교합니다. JIT는 감속 권고, 경로 추천은 접근 경로 후보 비교입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={runRouteScenarios}
                disabled={routeLoading}
                style={{
                  flex: "none",
                  height: 38,
                  padding: "0 13px",
                  borderRadius: 8,
                  border: "none",
                  background: routeLoading ? "#334155" : "#22c55e",
                  color: routeLoading ? "#94a3b8" : "#052e16",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: routeLoading ? "wait" : "pointer",
                }}
              >
                {routeLoading ? "계산 중" : "경로 추천 계산"}
              </button>
            </div>
            {routeError && <div style={{ marginTop: 10, color: "#fecaca", fontSize: 12, fontWeight: 800 }}>{routeError}</div>}
            {routeNotice && <div style={{ marginTop: 10, color: "#fde68a", fontSize: 12, lineHeight: 1.45 }}>{routeNotice}</div>}
            {routeResult?.validation && routeResult.validation.rejectedCount > 0 && (
              <div style={{ marginTop: 10, color: "#fdba74", fontSize: 11.5, lineHeight: 1.45 }}>
                입력 검증에서 {routeResult.validation.rejectedCount}척이 경로 추천 계산에서 제외되었습니다.
              </div>
            )}
          </section>

          <section style={{ flex: "0 0 260px", minHeight: 180, padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>가상 선박 목록</h2>
              <span style={{ color: muted, fontSize: 11, fontWeight: 800 }}>운영자 검토용</span>
            </div>

            {!hydrated || simulatedShips.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, height: "100%", overflowY: "auto", paddingRight: 2 }}>
                {simulatedShips.map((ship) => (
                  (() => {
                    const decision = decisionsByShipId.get(ship.id);
                    const stateLabel = jitLoading ? "계산 중" : decision ? "JIT 권고" : jitResult ? "권고 없음" : "계산 대기";
                    const stateColor = decision ? "#bfdbfe" : jitResult ? "#cbd5e1" : "#8aa0c8";
                    const destinationName = simulationDestinationName(ship.destinationPortId);
                    return (
                  <article
                    key={ship.id}
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(148,163,184,.14)",
                      background: "rgba(255,255,255,.035)",
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SimBadge source={ship.source} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ship.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShip(ship.id)}
                        aria-label={`${ship.name} 삭제`}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: "1px solid rgba(248,113,113,.22)",
                          background: "rgba(248,113,113,.08)",
                          color: "#fecaca",
                          cursor: "pointer",
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ marginTop: 8, color: stateColor, fontSize: 11, fontWeight: 900 }}>{stateLabel}</div>
                    <div style={{ marginTop: 4, color: muted, fontSize: 10.5 }}>
                      {ship.source === "ais-snapshot" ? "실제 AIS/Supabase 선박을 시뮬레이션용으로 복사한 항목" : "사용자 생성 가상 선박"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px", marginTop: 10, color: "#cbd5e1", fontSize: 12 }}>
                      <span style={{ gridColumn: "1 / -1" }}>도착지 {destinationName}</span>
                      <span>속도 {ship.sog}kn</span>
                      <span>{ship.vesselType ? SIMULATED_VESSEL_TYPE_LABELS[ship.vesselType] : "선종 -"}</span>
                      <span>GT {ship.grossTonnage != null ? formatGt(ship.grossTonnage) : "-"}</span>
                      {ship.mmsi || ship.imo ? <span style={{ gridColumn: "1 / -1" }}>MMSI/IMO {ship.mmsi ?? "-"} / {ship.imo ?? "-"}</span> : null}
                      <span>상태 underway</span>
                      <span>위도 {formatCoord(ship.lat)}</span>
                      <span>경도 {formatCoord(ship.lng)}</span>
                    </div>
                  </article>
                    );
                  })()
                ))}
              </div>
            )}
          </section>

          <section style={{ flex: "0 0 auto", minHeight: 220, padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)", overflow: "visible" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>JIT 시뮬레이션 결과</h2>
              {jitResult && <span style={{ color: muted, fontSize: 10.5 }}>{formatDateTime(jitResult.lastUpdated)}</span>}
            </div>

            {!jitResult ? (
              <div style={{ color: muted, fontSize: 12.5, lineHeight: 1.6 }}>
                JIT 계산 실행 후 권고 속도, ETA, 대기시간 감소, 연료 절감량, CO₂ 감축량이 여기에 표시됩니다.
              </div>
            ) : jitResult.summary.recommendedCount === 0 ? (
              <div style={{ color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.6 }}>
                <strong style={{ color: text }}>현재 생성된 가상 선박 기준으로 JIT 감속 권고가 없습니다.</strong>
                <br />
                {jitResult.emptyReason?.description}
                {(jitResult.summary.byDestination ?? []).map((item) => {
                  const congestion = jitResult.destinationCongestion?.[item.destinationPortId];
                  return (
                    <div key={item.destinationPortId} style={{ marginTop: 10, color: muted }}>
                      {item.destinationPortName} 현재 혼잡도 {congestion ? Math.round(congestion.level * 100) : "-"}% · 후보 {item.candidateCount}척 · 권고{" "}
                      {item.recommendedCount}척
                    </div>
                  );
                })}
                {jitResult.emptyReason?.suggestions?.slice(0, 2).map((suggestion) => (
                  <div key={suggestion} style={{ marginTop: 6, color: muted }}>
                    {suggestion}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", overflowY: "auto", paddingRight: 2 }}>
                {jitResult.summary.byDestination?.length ? (
                  <div style={{ borderRadius: 8, border: "1px solid rgba(56,189,248,.18)", background: "rgba(56,189,248,.08)", padding: 10, color: "#bae6fd", fontSize: 12, lineHeight: 1.45 }}>
                    계산 기준: 선택 도착지의 현재 Port-MIS 혼잡도
                    <br />
                    {(jitResult.summary.byDestination ?? []).map((item) => {
                      const congestion = jitResult.destinationCongestion?.[item.destinationPortId];
                      return `${item.destinationPortName} ${congestion ? Math.round(congestion.level * 100) : "-"}%${congestion ? ` · ${congestion.status}` : ""}`;
                    }).join(" / ")}
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ borderRadius: 8, background: "rgba(56,189,248,.08)", padding: 9 }}>
                    <div style={{ color: muted, fontSize: 10, fontWeight: 800 }}>대기 감소</div>
                    <div style={{ marginTop: 3, fontSize: 15, fontWeight: 900 }}>{jitResult.summary.totalReducedWaitingMinutes}분</div>
                  </div>
                  <div style={{ borderRadius: 8, background: "rgba(34,197,94,.08)", padding: 9 }}>
                    <div style={{ color: muted, fontSize: 10, fontWeight: 800 }}>연료 절감</div>
                    <div style={{ marginTop: 3, fontSize: 15, fontWeight: 900 }}>{formatKg(jitResult.summary.totalEstimatedFuelSavedKg)}</div>
                  </div>
                  <div style={{ borderRadius: 8, background: "rgba(250,204,21,.08)", padding: 9 }}>
                    <div style={{ color: muted, fontSize: 10, fontWeight: 800 }}>CO₂ 감축</div>
                    <div style={{ marginTop: 3, fontSize: 15, fontWeight: 900 }}>{formatKg(jitResult.summary.totalEstimatedCo2ReducedKg)}</div>
                  </div>
                </div>

                {jitResult.decisions.map((decision) => (
                  <article key={decision.shipId ?? decision.shipName} style={{ borderRadius: 10, border: "1px solid rgba(148,163,184,.14)", background: "rgba(255,255,255,.035)", padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SimBadge source={decision.scenarioSource ?? "manual"} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {decision.shipName}
                      </div>
                      <span style={{ color: "#bae6fd", fontSize: 10.5, fontWeight: 900 }}>{decision.confidence}</span>
                    </div>
                    <div style={{ marginTop: 7, color: muted, fontSize: 10.5, fontWeight: 800 }}>
                      {decision.scenarioSource === "ais-snapshot" ? "LIVE SNAPSHOT · 실제 선박 데이터 기반 시뮬레이션" : "SIMULATION · 사용자 생성 가상 선박"}
                    </div>
                    <p style={{ margin: "9px 0 0", color: "#cbd5e1", fontSize: 11.5, lineHeight: 1.5 }}>
                      {decision.destinationPortName ?? simulationDestinationName(decision.destinationPortId)} 현재 혼잡도 기준으로 계산했습니다. 권고 속도로 감속하면 대기시간 일부를 항해시간으로 흡수할 수 있습니다.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px", marginTop: 10, color: "#cbd5e1", fontSize: 12 }}>
                      <span>도착지 {decision.destinationPortName ?? simulationDestinationName(decision.destinationPortId)}</span>
                      <span>거리 {decision.distanceNm}NM</span>
                      <span>현재 속도 {decision.currentSpeedKn}kn</span>
                      <span>권고 속도 {decision.recommendedSpeedKn}kn</span>
                      <span>현재 ETA {formatDateTime(decision.currentEta)}</span>
                      <span>권고 ETA {formatDateTime(decision.recommendedEta)}</span>
                      <span>현재 혼잡 {Math.round(decision.currentCongestionLevel * 100)}% · {decision.currentCongestionStatus}</span>
                      <span>권고 시간대 {decision.recommendedCongestionStatus}</span>
                      <span>대기 감소 {decision.reducedWaitingMinutes}분</span>
                      <span>잔여 대기 {decision.optimizedWaitingMinutes}분</span>
                      <span>연료 절감 {formatKg(decision.estimatedFuelSavedKg)}</span>
                      <span>CO₂ 감축 {formatKg(decision.estimatedCo2ReducedKg)}</span>
                      <span>혼잡도 기준 {destinationBasisLabel(decision.congestionBasis)}</span>
                      <span>source {decision.scenarioSource ?? "manual"}</span>
                    </div>
                    {decision.reasons?.slice(0, 2).map((reason) => (
                      <div key={reason} style={{ marginTop: 7, color: muted, fontSize: 10.5, lineHeight: 1.35 }}>
                        {reason}
                      </div>
                    ))}
                  </article>
                ))}

                <div style={{ color: "#fde68a", fontSize: 11.5, lineHeight: 1.5 }}>
                  이 결과는 실제 선박 데이터 또는 사용자가 만든 시나리오를 기반으로 한 시뮬레이션 추정값이며 실제 운항 지시가 아닙니다.
                </div>
              </div>
            )}
          </section>

          <section style={{ flex: "0 0 auto", minHeight: 240, padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)", overflow: "visible" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>친환경 경로 추천 결과</h2>
              {routeResult && <span style={{ color: muted, fontSize: 10.5 }}>{formatDateTime(routeResult.lastUpdated)}</span>}
            </div>
            <RouteScenarioResults result={routeResult} />
          </section>
        </aside>
      </div>

      <SimulatedShipModal
        open={pendingPosition !== null}
        position={pendingPosition}
        defaultName={defaultName}
        onCancel={() => setPendingPosition(null)}
        onCreate={createShip}
      />
      <LiveShipImportModal
        open={liveImportOpen}
        onCancel={() => setLiveImportOpen(false)}
        onImport={createShip}
      />
    </div>
  );
}
