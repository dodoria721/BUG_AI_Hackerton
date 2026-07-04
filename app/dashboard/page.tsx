"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CongestionForecast, PortCall, Ship } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import VesselPanel from "@/frontend/components/VesselPanel";
import AdvisorPanel from "@/frontend/components/AdvisorPanel";

// Leaflet은 window에 의존하므로 서버에서 렌더링하면 안 된다.
const ShipMap = dynamic(() => import("@/frontend/components/ShipMap"), { ssr: false });

const muted = "#8aa0c8";
const panel = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";

function congestionColor(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "#34d399";
  if (level <= medium) return "#fbbf24";
  return "#f87171";
}

// 상단 텔레메트리 바의 지표 한 칸
function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 62 }}>
      <div style={{ fontSize: 10.5, color: muted, fontWeight: 700, letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ?? "#e7ecf5", lineHeight: 1.2 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: muted, marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}

const RAIL_ICONS = ["🗺️", "🚢", "⚓", "📊", "⚙️"];

export default function DashboardPage() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [congestion, setCongestion] = useState<CongestionForecast | null>(null);
  const [portCalls, setPortCalls] = useState<PortCall[]>([]);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [s, cg, pc] = await Promise.all([
        fetch("/api/ships").then((r) => r.json()),
        fetch("/api/congestion").then((r) => r.json()),
        fetch("/api/port-calls").then((r) => r.json()),
      ]);
      if (!active) return;
      setShips(Array.isArray(s) ? s : []);
      setCongestion(cg && cg.forecast ? cg : null);
      setPortCalls(Array.isArray(pc) ? pc : []);
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const berthed = portCalls.filter((c) => c.berthType === "접안").length;
  const anchoredPm = portCalls.filter((c) => c.berthType === "묘박").length;
  const level = congestion?.currentLevel ?? 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#070c17", overflow: "hidden", fontFamily: "Pretendard, system-ui, sans-serif" }}>
      {/* 배경 지도 */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ShipMap ships={ships} selectedMmsi={selectedMmsi} onSelect={setSelectedMmsi} portCalls={portCalls} />
      </div>
      {/* 다크 무드 틴트 (지도 클릭 방해 안 함) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 400,
          background: "radial-gradient(120% 80% at 50% 0%, rgba(7,12,23,0) 55%, rgba(7,12,23,.45) 100%)",
        }}
      />

      {/* 좌측 아이콘 레일 */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          bottom: 16,
          width: 52,
          zIndex: 500,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "12px 0",
          background: panel,
          backdropFilter: "blur(14px)",
          border,
          borderRadius: 14,
        }}
      >
        <Link
          href="/"
          title="홈"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "linear-gradient(135deg,#2f6bff,#5b8cff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
            textDecoration: "none",
          }}
        >
          <div style={{ width: 12, height: 12, border: "2.5px solid #fff", borderRadius: "50%", borderRightColor: "transparent" }} />
        </Link>
        {RAIL_ICONS.map((ic, i) => (
          <div
            key={i}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              color: muted,
              background: i === 0 ? "rgba(56,189,248,.12)" : "transparent",
              cursor: "pointer",
            }}
          >
            {ic}
          </div>
        ))}
      </div>

      {/* 상단 텔레메트리 바 (항만 종합 현황) */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 500,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "10px 22px",
          background: panel,
          backdropFilter: "blur(14px)",
          border,
          borderRadius: 14,
          color: "#e7ecf5",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", marginRight: 4 }}>
          <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: "-.01em" }}>PORTIQ</span>
          <span style={{ fontSize: 10, color: muted, fontWeight: 700 }}>{BUSAN_PORT.name} 실시간 관제</span>
        </div>
        <div style={{ width: 1, height: 30, background: "rgba(255,255,255,.1)" }} />
        <Metric label="정박" value={String(portCalls.length)} unit="척" />
        <Metric label="접안" value={String(berthed)} unit="척" accent="#34d399" />
        <Metric label="묘박" value={String(anchoredPm)} unit="척" accent="#fbbf24" />
        <Metric label="AIS 위치" value={String(ships.length)} unit="척" accent="#38bdf8" />
        <div style={{ width: 1, height: 30, background: "rgba(255,255,255,.1)" }} />
        <Metric label="혼잡도" value={String(Math.round(level * 100))} unit="%" accent={congestionColor(level)} />
      </div>

      {/* 범례 */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 404,
          zIndex: 500,
          padding: "10px 14px",
          background: panel,
          backdropFilter: "blur(14px)",
          border,
          borderRadius: 12,
          color: "#e7ecf5",
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        <div style={{ color: muted, fontSize: 10, marginBottom: 6, letterSpacing: ".08em" }}>범례</div>
        {[
          ["#38bdf8", "항해 중 (AIS)"],
          ["#4ade80", "접안"],
          ["#fbbf24", "묘박"],
        ].map(([c, t]) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
            {t}
          </div>
        ))}
      </div>

      {/* 우측 선박 패널 */}
      <VesselPanel calls={portCalls} selectedKey={selectedVessel} onSelect={setSelectedVessel} />

      {/* 좌하단 혼잡도 미니 패널 (인라인 막대) */}
      {congestion && (
        <div
          style={{
            position: "absolute",
            left: 84,
            bottom: 16,
            width: 380,
            maxWidth: "calc(100vw - 480px)",
            zIndex: 500,
            padding: "12px 14px 10px",
            background: panel,
            backdropFilter: "blur(14px)",
            border,
            borderRadius: 14,
            color: "#e7ecf5",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".04em" }}>시간대별 혼잡도</span>
            <span style={{ fontSize: 10.5, color: muted }}>Port-MIS 입항 신고 · 최근 6h~향후 18h</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56 }}>
            {congestion.forecast.map((p, i) => {
              const now = Date.now();
              const isNow = Math.abs(new Date(p.time).getTime() - now) < 30 * 60 * 1000;
              return (
                <div
                  key={i}
                  title={`${new Date(p.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} · 입항 ${p.arrivals ?? 0}건`}
                  style={{
                    flex: 1,
                    height: `${Math.max(4, p.level * 100)}%`,
                    borderRadius: "3px 3px 1px 1px",
                    background: isNow ? "#38bdf8" : congestionColor(p.level),
                    opacity: isNow ? 1 : 0.72,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* AI 어드바이저 FAB */}
      <AdvisorPanel />
    </div>
  );
}
