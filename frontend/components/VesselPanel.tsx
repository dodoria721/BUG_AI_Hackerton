"use client";

import { useMemo, useState } from "react";
import type { BerthType, PortCall } from "@/backend/ports/port-types";

// MOVIDIK 스타일 우측 선박 패널 — 검색 + 필터 탭 + 선박 목록 + 선택 선박 상세 카드.
// 데이터는 Port-MIS 정박선(PortCall). 실시간 위경도/속력은 AIS 쪽(지도)에 있고, 여기선
// 공식 제원(호출부호·총톤수·선종·출발지→도착지·선석)을 보여준다.

function vesselKey(c: PortCall): string {
  return `${c.callSign}|${c.vesselName}`;
}

const BERTH_COLOR: Record<BerthType, string> = { 접안: "#34d399", 묘박: "#fbbf24" };

const panelBg = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";
const muted = "#8aa0c8";
const ink = "#e7ecf5";

function fmt(v: string | number | undefined | null, suffix = ""): string {
  if (v === undefined || v === null || v === "") return "-";
  return `${v}${suffix}`;
}
function fmtTime(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface VesselPanelProps {
  calls: PortCall[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

export default function VesselPanel({ calls, selectedKey, onSelect }: VesselPanelProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"전체" | BerthType>("전체");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return calls.filter((c) => {
      if (tab !== "전체" && c.berthType !== tab) return false;
      if (!query) return true;
      return (
        c.vesselName.toLowerCase().includes(query) ||
        (c.callSign ?? "").toLowerCase().includes(query) ||
        (c.vesselType ?? "").toLowerCase().includes(query)
      );
    });
  }, [calls, q, tab]);

  const selected = calls.find((c) => vesselKey(c) === selectedKey) ?? null;
  const counts = {
    전체: calls.length,
    접안: calls.filter((c) => c.berthType === "접안").length,
    묘박: calls.filter((c) => c.berthType === "묘박").length,
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        bottom: 16,
        width: 372,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
        background: panelBg,
        backdropFilter: "blur(14px)",
        border,
        borderRadius: 16,
        boxShadow: "0 20px 50px rgba(0,0,0,.5)",
        color: ink,
        overflow: "hidden",
        fontFamily: "Pretendard, system-ui, sans-serif",
      }}
    >
      {/* 검색 + 탭 */}
      <div style={{ padding: "14px 14px 10px", borderBottom: border }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,.05)",
            border,
            borderRadius: 10,
            padding: "9px 12px",
          }}
        >
          <span style={{ color: muted, fontSize: 14 }}>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="선박명 / 호출부호 / 선종 검색"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: ink,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {(["전체", "접안", "묘박"] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  border: active ? "1px solid #38bdf8" : border,
                  background: active ? "rgba(56,189,248,.14)" : "transparent",
                  color: active ? "#7dd3fc" : muted,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {t} {counts[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {filtered.length === 0 && (
          <p style={{ color: muted, fontSize: 13, textAlign: "center", marginTop: 24 }}>
            표시할 선박이 없습니다.
          </p>
        )}
        {filtered.map((c) => {
          const key = vesselKey(c);
          const isSel = key === selectedKey;
          const color = c.berthType ? BERTH_COLOR[c.berthType] : muted;
          return (
            <div key={key}>
              <button
                onClick={() => onSelect(isSel ? null : key)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 10px",
                  marginBottom: 6,
                  border: isSel ? "1px solid #38bdf8" : border,
                  background: isSel ? "rgba(56,189,248,.10)" : "rgba(255,255,255,.03)",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: ink,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: "rgba(255,255,255,.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flex: "none",
                  }}
                >
                  🚢
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.vesselName}
                  </div>
                  <div style={{ fontSize: 11.5, color: muted, marginTop: 1 }}>
                    {c.vesselType ?? "선박"} · {c.callSign || "호출부호 미상"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color,
                    background: "rgba(255,255,255,.06)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    flex: "none",
                  }}
                >
                  {c.berthType ?? "-"}
                </span>
              </button>

              {/* 선택된 선박 상세 */}
              {isSel && selected && <VesselDetail c={selected} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.04)",
        border,
        borderRadius: 10,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 10.5, color: muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: accent ?? ink }}>{value}</div>
    </div>
  );
}

function VesselDetail({ c }: { c: PortCall }) {
  const color = c.berthType === "묘박" ? "#fbbf24" : "#34d399";
  return (
    <div
      style={{
        margin: "0 2px 10px",
        padding: "12px",
        borderRadius: 12,
        background: "rgba(20,30,54,.6)",
        border: "1px solid rgba(120,160,255,.2)",
      }}
    >
      {/* 선박 제원 */}
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7dd3fc", letterSpacing: ".06em", marginBottom: 8 }}>
        선박 제원
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCell label="호출부호" value={fmt(c.callSign)} />
        <StatCell label="총톤수(GT)" value={c.grossTonnage != null ? `${c.grossTonnage.toLocaleString()} t` : "-"} />
        <StatCell label="선종" value={fmt(c.vesselType)} />
        <StatCell label="선적국" value={fmt(c.nationality)} />
      </div>

      {/* 출발지 → 도착지 */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: muted, fontWeight: 700 }}>
          <span>출발지</span>
          <span>현재 정박</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{c.previousPort ?? "-"}</span>
          <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,.12)", borderRadius: 2, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, width: "100%", background: `linear-gradient(90deg,${color},transparent)`, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#7dd3fc" }}>부산항</span>
        </div>
        {c.nextPort && (
          <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>다음 기항지: {c.nextPort}</div>
        )}
      </div>

      {/* 상태 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <StatCell label="정박 상태" value={fmt(c.berthType)} accent={color} />
        <StatCell label="입항 시각" value={fmtTime(c.eventTime)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <StatCell label="정박 위치(선석)" value={fmt(c.berthName)} />
      </div>
    </div>
  );
}
