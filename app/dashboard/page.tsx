"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CongestionForecast, PortCall, Ship } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import VesselPanel from "@/frontend/components/VesselPanel";
import AdvisorPanel from "@/frontend/components/AdvisorPanel";
import { BASEMAPS, BASEMAP_STORAGE, initialBasemapId, type Basemap } from "@/frontend/components/basemaps";
import { RIGHT_LEGEND_RIGHT } from "@/frontend/components/layout";

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

// "표시 항목" 카테고리 — 사이트 안에서 화면 오버레이를 켜고 끈다.
type LayerKey = "vessels" | "congestion" | "legend";
const LAYER_ITEMS: { key: LayerKey; label: string; icon: string }[] = [
  { key: "vessels", label: "선박 패널", icon: "🚢" },
  { key: "congestion", label: "혼잡도", icon: "📊" },
  { key: "legend", label: "범례", icon: "🎨" },
];
const LAYERS_STORAGE = "portiq.layers";

// localStorage 저장 — SSR 가드를 한 곳으로 모은다.
function saveLocal(key: string, value: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, value);
}

function initialLayers(): Record<LayerKey, boolean> {
  const def: Record<LayerKey, boolean> = { vessels: true, congestion: true, legend: true };
  if (typeof window === "undefined") return def;
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAYERS_STORAGE) || "null");
    return saved ? { ...def, ...saved } : def;
  } catch {
    return def;
  }
}

// 우측 레일 플라이아웃 공용 스타일
const flyoutHeader: CSSProperties = { padding: "4px 8px 6px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: muted };
const flyoutRow: CSSProperties = {
  position: "relative",
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "8px 10px",
  fontSize: 12.5,
  fontWeight: 700,
  textAlign: "left",
  border: "none",
  borderRadius: 8,
};

// 우측 세로 툴바의 아이콘 버튼 + 왼쪽으로 열리는 플라이아웃 패널
function RailButton({
  icon,
  label,
  active,
  onClick,
  children,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onClick}
        title={label}
        style={{
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          borderRadius: 10,
          cursor: "pointer",
          border: "none",
          color: active ? "#fff" : muted,
          background: active ? "linear-gradient(135deg,#2f6bff,#5b8cff)" : "transparent",
        }}
      >
        {icon}
      </button>
      {active && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 48,
            width: 184,
            padding: 6,
            background: "rgba(11,18,34,0.94)",
            backdropFilter: "blur(14px)",
            border,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,.45)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [congestion, setCongestion] = useState<CongestionForecast | null>(null);
  const [portCalls, setPortCalls] = useState<PortCall[]>([]);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(initialLayers);
  const [basemapId, setBasemapId] = useState<string>(initialBasemapId);
  const [openMenu, setOpenMenu] = useState<null | "map" | "layers">(null);

  function toggleLayer(k: LayerKey) {
    setLayers((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      saveLocal(LAYERS_STORAGE, JSON.stringify(next));
      return next;
    });
  }

  function selectBasemap(b: Basemap) {
    if (!b.url) return; // 비활성(설정 필요) 항목은 무시
    setBasemapId(b.id);
    setOpenMenu(null);
    saveLocal(BASEMAP_STORAGE, b.id);
  }

  const currentBasemap = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0];

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
        <ShipMap ships={ships} selectedMmsi={selectedMmsi} onSelect={setSelectedMmsi} portCalls={portCalls} basemapId={basemapId} />
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

      {/* 우측 세로 툴바 — 지도 타입 / 표시 항목 카테고리 (레퍼런스 스타일, 왼쪽으로 펼침) */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 600,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "8px 6px",
          background: panel,
          backdropFilter: "blur(14px)",
          border,
          borderRadius: 14,
        }}
      >
        {/* 지도 타입 */}
        <RailButton
          icon={currentBasemap.icon}
          label="지도 타입"
          active={openMenu === "map"}
          onClick={() => setOpenMenu((v) => (v === "map" ? null : "map"))}
        >
          <div style={flyoutHeader}>지도 타입</div>
          {BASEMAPS.map((b) => {
            const on = b.id === currentBasemap.id;
            const disabled = !b.url;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => selectBasemap(b)}
                disabled={disabled}
                title={disabled ? b.note : `배경: ${b.label}`}
                style={{
                  ...flyoutRow,
                  color: disabled ? "#5a6b8c" : on ? "#fff" : "#c7d3ea",
                  background: on ? "rgba(56,120,255,.16)" : "transparent",
                  cursor: disabled ? "not-allowed" : "pointer",
                  marginTop: b.separator ? 6 : 0,
                  borderTop: b.separator ? "1px solid rgba(255,255,255,.08)" : "none",
                  paddingTop: b.separator ? 12 : 8,
                }}
              >
                <span style={{ fontSize: 14, width: 16, textAlign: "center", opacity: disabled ? 0.5 : 1 }}>{b.icon}</span>
                <span style={{ flex: 1 }}>{b.label}</span>
                {on && <span style={{ position: "absolute", right: 4, top: 8, bottom: 8, width: 3, borderRadius: 2, background: "#3b82f6" }} />}
              </button>
            );
          })}
        </RailButton>

        {/* 표시 항목 */}
        <RailButton
          icon="🧭"
          label="표시 항목"
          active={openMenu === "layers"}
          onClick={() => setOpenMenu((v) => (v === "layers" ? null : "layers"))}
        >
          <div style={flyoutHeader}>표시 항목</div>
          {LAYER_ITEMS.map((item) => {
            const on = layers[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleLayer(item.key)}
                style={{ ...flyoutRow, color: on ? "#fff" : "#8aa0c8", background: on ? "rgba(56,120,255,.16)" : "transparent", cursor: "pointer" }}
              >
                <span style={{ fontSize: 14, width: 16, textAlign: "center" }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 12, color: on ? "#3b82f6" : "rgba(255,255,255,.2)" }}>{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </RailButton>
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
      {layers.legend && (
      <div
        style={{
          position: "absolute",
          top: 16,
          right: RIGHT_LEGEND_RIGHT,
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
      )}

      {/* 우측 선박 패널 */}
      {layers.vessels && <VesselPanel calls={portCalls} selectedKey={selectedVessel} onSelect={setSelectedVessel} />}

      {/* 좌하단 혼잡도 미니 패널 (인라인 막대) */}
      {layers.congestion && congestion && (
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
