"use client";

import { useMemo, useState } from "react";
import type { BerthType, PortCall } from "@/frontend/types/domain";
import { RIGHT_PANEL_RIGHT, RIGHT_PANEL_WIDTH } from "./layout";
import { LT } from "./theme";

// MOVIDIK 스타일 우측 선박 패널 — 검색 + 필터 탭 + 선박 목록 + 선택 선박 상세 카드.
// 데이터는 Port-MIS 정박선(PortCall). 실시간 위경도/속력은 AIS 쪽(지도)에 있고, 여기선
// 공식 제원(호출부호·총톤수·선종·출발지→도착지·선석)을 보여준다.

function vesselKey(c: PortCall): string {
  return `${c.callSign}|${c.vesselName}`;
}

const BERTH_COLOR: Record<BerthType, string> = { 접안: LT.green, 묘박: LT.amber };

const panelBg = LT.panel;
const border = LT.border;
const muted = LT.muted;
const ink = LT.ink;

function fmt(v: string | number | undefined | null, suffix = ""): string {
  if (v === undefined || v === null || v === "") return "-";
  return `${v}${suffix}`;
}
function fmtTime(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d)) {
    p[part.type] = part.value;
  }
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`;
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

  const selected = useMemo(() => calls.find((c) => vesselKey(c) === selectedKey) ?? null, [calls, selectedKey]);
  const counts = useMemo(
    () =>
      calls.reduce<Record<"전체" | BerthType, number>>(
        (acc, call) => {
          acc.전체 += 1;
          if (call.berthType) acc[call.berthType] += 1;
          return acc;
        },
        { 전체: 0, 접안: 0, 묘박: 0 }
      ),
    [calls]
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: RIGHT_PANEL_RIGHT, // 우측 세로 툴바(레일) 자리를 비운다
        bottom: 16,
        width: RIGHT_PANEL_WIDTH,
        maxWidth: `calc(100vw - ${RIGHT_PANEL_RIGHT + 32}px)`,
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
        background: panelBg,
        backdropFilter: "blur(14px)",
        border,
        borderRadius: 16,
        boxShadow: LT.shadow,
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
            background: LT.tile,
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
                  border: "none",
                  background: active ? LT.blue : LT.tile,
                  color: active ? "#fff" : muted,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "7px 0",
                  borderRadius: 9,
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
          const badgeBg =
            c.berthType === "접안" ? "rgba(22,163,74,.12)" : c.berthType === "묘박" ? "rgba(232,149,43,.14)" : LT.tile;

          const header = (
            <button
              onClick={() => onSelect(isSel ? null : key)}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: isSel ? "12px 12px 10px" : "10px 10px",
                border: "none",
                background: "transparent",
                borderRadius: isSel ? 0 : 12,
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
                  background: isSel ? LT.blueSoft : LT.tile,
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
              <span style={{ fontSize: 11, fontWeight: 800, color, background: badgeBg, padding: "4px 10px", borderRadius: 999, flex: "none" }}>
                {c.berthType ?? "-"}
              </span>
            </button>
          );

          // 선택 시: 헤더 + 상세를 하나의 파란 테두리 카드로 묶는다.
          if (isSel && selected) {
            return (
              <div
                key={key}
                style={{ marginBottom: 8, border: `1.5px solid ${LT.blue}`, background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 6px 18px rgba(37,99,235,.12)" }}
              >
                {header}
                <VesselDetail c={selected} />
              </div>
            );
          }

          return (
            <div key={key} style={{ marginBottom: 6, border, background: "#fff", borderRadius: 12 }}>
              {header}
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
        background: LT.tile,
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
  const color = c.berthType === "묘박" ? LT.amber : LT.green;
  return (
    <div style={{ padding: "2px 12px 14px" }}>
      {/* 선박 제원 */}
      <div style={{ fontSize: 11, fontWeight: 800, color: LT.blue, letterSpacing: ".06em", marginBottom: 8 }}>선박 제원</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCell label="호출부호" value={fmt(c.callSign)} />
        <StatCell label="총톤수(GT)" value={c.grossTonnage != null ? `${c.grossTonnage.toLocaleString()} t` : "-"} />
        <StatCell label="선종" value={fmt(c.vesselType)} />
        <StatCell label="선적국" value={fmt(c.nationality)} />
      </div>

      {/* 출발지 → 부산항 진행 바 */}
      <div style={{ margin: "14px 0 2px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: ink, whiteSpace: "nowrap" }}>{c.previousPort ?? "-"}</span>
        <div style={{ flex: 1, position: "relative", height: 12 }}>
          <div style={{ position: "absolute", top: 4.5, left: 0, right: 0, height: 3, background: "rgba(15,23,42,.10)", borderRadius: 2 }} />
          <div style={{ position: "absolute", top: 4.5, left: 0, width: "82%", height: 3, background: LT.blue, borderRadius: 2 }} />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "82%",
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: LT.blue,
              transform: "translateX(-50%)",
              boxShadow: "0 0 0 3px #fff, 0 1px 4px rgba(15,23,42,.28)",
            }}
          />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: LT.blue, whiteSpace: "nowrap" }}>부산항</span>
      </div>
      {c.nextPort && <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>다음 기항지: {c.nextPort}</div>}

      {/* 상태 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        <StatCell label="정박 상태" value={fmt(c.berthType)} accent={color} />
        <StatCell label="입항 시각" value={fmtTime(c.eventTime)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <StatCell label="정박 위치(선석)" value={fmt(c.berthName)} />
      </div>
    </div>
  );
}
