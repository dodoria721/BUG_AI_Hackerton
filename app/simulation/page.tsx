"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type CSSProperties } from "react";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import LeftRail from "@/frontend/components/LeftRail";
import SimulatedShipModal from "@/frontend/components/SimulatedShipModal";
import { useSimulatedShips } from "@/frontend/hooks/useSimulatedShips";
import type { NewSimulatedShipInput, SimulatedShip } from "@/frontend/types/simulation";
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

function SimBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 7px",
        borderRadius: 6,
        background: "rgba(250,204,21,.16)",
        color: "#fde68a",
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: ".06em",
      }}
    >
      SIM
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

  const defaultName = useMemo(() => nextDefaultName(simulatedShips), [simulatedShips]);

  function createShip(input: NewSimulatedShipInput) {
    addSimulatedShip(input);
    setPendingPosition(null);
  }

  function clearAll() {
    if (simulatedShips.length === 0) return;
    clearSimulatedShips();
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

      <div style={{ position: "absolute", inset: "16px 16px 16px 84px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 14 }}>
        <main style={{ position: "relative", minWidth: 0, border, borderRadius: 14, overflow: "hidden", background: "#0b1220" }}>
          <SimulationMap ships={simulatedShips} simulationMode={simulationMode} onMapContextMenu={setPendingPosition} />

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
                  <span style={{ color: "#38bdf8", fontSize: 11, fontWeight: 900, letterSpacing: ".08em" }}>{BUSAN_PORT.name} 운영자 검토용</span>
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
              실제 운항 데이터가 아닌 가상 시나리오입니다. 이 페이지의 선박은 사용자가 생성한 가상 선박이며 실제 AIS/Port-MIS 데이터가 아닙니다.
            </div>
          </section>
        </main>

        <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
          <section style={{ padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ color: muted, fontSize: 11, fontWeight: 800, letterSpacing: ".06em" }}>SIMULATION FLEET</div>
                <div style={{ marginTop: 3, fontSize: 22, fontWeight: 900 }}>{hydrated ? simulatedShips.length : 0}척</div>
              </div>
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
            <p style={{ margin: "10px 0 0", color: muted, fontSize: 12, lineHeight: 1.5 }}>
              저장 위치는 브라우저 localStorage입니다. Supabase ships 테이블에는 저장하지 않습니다.
            </p>
          </section>

          <section style={{ flex: 1, minHeight: 0, padding: 14, borderRadius: 14, border, background: panel, backdropFilter: "blur(14px)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>가상 선박 목록</h2>
              <span style={{ color: muted, fontSize: 11, fontWeight: 800 }}>운영자 검토용</span>
            </div>

            {!hydrated || simulatedShips.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, height: "100%", overflowY: "auto", paddingRight: 2 }}>
                {simulatedShips.map((ship) => (
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
                      <SimBadge />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ship.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSimulatedShip(ship.id)}
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px", marginTop: 10, color: "#cbd5e1", fontSize: 12 }}>
                      <span>속도 {ship.sog}kn</span>
                      <span>{SIMULATED_VESSEL_TYPE_LABELS[ship.vesselType]}</span>
                      <span>GT {formatGt(ship.grossTonnage)}</span>
                      <span>상태 underway</span>
                      <span>위도 {formatCoord(ship.lat)}</span>
                      <span>경도 {formatCoord(ship.lng)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
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
    </div>
  );
}
