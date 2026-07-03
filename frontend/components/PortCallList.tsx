"use client";

import { useEffect, useState } from "react";
import type { PortCall } from "@/backend/ports/port-types";

const EVENT_BADGE: Record<string, { bg: string; color: string }> = {
  입항: { bg: "#e8f0ff", color: "#2f6bff" },
  출항: { bg: "#fff0f0", color: "#e0483d" },
};

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

  if (loading) {
    return <p style={{ color: "#8a97b3", fontWeight: 600, fontSize: 14 }}>불러오는 중...</p>;
  }

  if (calls.length === 0) {
    return (
      <p style={{ color: "#8a97b3", fontSize: 13.5, lineHeight: 1.6 }}>
        Port-MIS 입출항 데이터가 아직 없습니다. <code>npm run enrich:portmis</code>를 실행하면
        부산항 공식 입출항 신고가 채워집니다.
      </p>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
        <thead className="sticky top-0" style={{ background: "#fff", color: "#8a97b3", fontSize: 12.5 }}>
          <tr>
            <th className="pb-2 pr-2 font-semibold">선박명</th>
            <th className="pb-2 pr-2 font-semibold">구분</th>
            <th className="pb-2 pr-2 font-semibold">선석</th>
            <th className="pb-2 pr-2 font-semibold">직전항 → 다음항</th>
            <th className="pb-2 font-semibold">신고시각</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c, i) => {
            const badge = EVENT_BADGE[c.event] ?? EVENT_BADGE["입항"];
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
                    {c.event}
                  </span>
                </td>
                <td className="py-2.5 pr-2" style={{ color: "#5a6785" }}>
                  {c.berthName ?? "—"}
                </td>
                <td className="py-2.5 pr-2" style={{ color: "#5a6785", fontSize: 12.5 }}>
                  {c.previousPort ?? "?"} → {c.nextPort ?? "?"}
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
  );
}
