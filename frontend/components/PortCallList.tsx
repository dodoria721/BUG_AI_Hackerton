"use client";

import { useEffect, useMemo, useState } from "react";
import type { BerthType, PortCall } from "@/backend/ports/port-types";

const BERTH_BADGE: Record<BerthType, { bg: string; color: string; label: string }> = {
  접안: { bg: "#eafaf0", color: "#16a34a", label: "접안" },
  묘박: { bg: "#fff3e6", color: "#e8952b", label: "묘박" },
};

type Filter = "전체" | BerthType;

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PortCallList() {
  const [calls, setCalls] = useState<PortCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("전체");

  useEffect(() => {
    let active = true;
    fetch("/api/port-calls")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setCalls(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    let 접안 = 0;
    let 묘박 = 0;
    for (const c of calls) {
      if (c.berthType === "접안") 접안++;
      else if (c.berthType === "묘박") 묘박++;
    }
    return { 접안, 묘박 };
  }, [calls]);

  const shown = filter === "전체" ? calls : calls.filter((c) => c.berthType === filter);

  if (loading) {
    return <p style={{ color: "#8a97b3", fontWeight: 600, fontSize: 14 }}>불러오는 중...</p>;
  }

  if (calls.length === 0) {
    return (
      <p style={{ color: "#8a97b3", fontSize: 13.5, lineHeight: 1.6 }}>
        현재 정박 중인 선박 데이터가 없습니다. <code>npm run enrich:portmis</code>를 실행하면
        부산항 공식 정박 현황이 채워집니다.
      </p>
    );
  }

  const chips: Filter[] = ["전체", "접안", "묘박"];

  return (
    <div>
      {/* 접안/묘박 필터 칩 + 요약 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {chips.map((chip) => {
          const active = filter === chip;
          const n = chip === "전체" ? calls.length : chip === "접안" ? counts.접안 : counts.묘박;
          return (
            <button
              key={chip}
              onClick={() => setFilter(chip)}
              className="portiq-btn"
              style={{
                border: active ? "1px solid #2f6bff" : "1px solid rgba(10,24,48,.14)",
                background: active ? "#eef4ff" : "#fff",
                color: active ? "#2f6bff" : "#5a6785",
                fontFamily: "inherit",
                fontSize: 12.5,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {chip} {n}
            </button>
          );
        })}
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
          <thead className="sticky top-0" style={{ background: "#fff", color: "#8a97b3", fontSize: 12.5 }}>
            <tr>
              <th className="pb-2 pr-2 font-semibold">선박명</th>
              <th className="pb-2 pr-2 font-semibold">구분</th>
              <th className="pb-2 pr-2 font-semibold">정박 위치</th>
              <th className="pb-2 pr-2 font-semibold">출발지(직전항)</th>
              <th className="pb-2 pr-2 font-semibold">총톤수</th>
              <th className="pb-2 font-semibold">입항시각</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c, i) => {
              const badge = c.berthType ? BERTH_BADGE[c.berthType] : null;
              return (
                <tr key={`${c.callSign}-${c.vesselName}-${i}`} style={{ borderTop: "1px solid rgba(10,24,48,.06)" }}>
                  <td className="py-2.5 pr-2" style={{ fontWeight: 700, color: "#0a1830" }}>
                    {c.vesselName}
                    {c.vesselType && (
                      <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 500, color: "#8a97b3" }}>
                        {c.vesselType}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2">
                    {badge && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: 999,
                          background: badge.bg,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2" style={{ color: "#5a6785" }}>
                    {c.berthName ?? "—"}
                  </td>
                  <td className="py-2.5 pr-2" style={{ color: "#5a6785", fontSize: 12.5 }}>
                    {c.previousPort ?? "—"}
                  </td>
                  <td className="py-2.5 pr-2" style={{ color: "#5a6785" }}>
                    {c.grossTonnage != null ? `${c.grossTonnage.toLocaleString()}톤` : "—"}
                  </td>
                  <td className="py-2.5" style={{ color: "#5a6785" }}>
                    {fmtTime(c.eventTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
