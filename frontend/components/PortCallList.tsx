"use client";

import { useEffect, useState } from "react";
import type { PortCall } from "@/backend/ports/port-types";

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
        현재 정박 중인 선박 데이터가 없습니다. <code>npm run enrich:portmis</code>를 실행하면
        부산항 공식 정박 현황이 채워집니다.
      </p>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
        <thead className="sticky top-0" style={{ background: "#fff", color: "#8a97b3", fontSize: 12.5 }}>
          <tr>
            <th className="pb-2 pr-2 font-semibold">선박명</th>
            <th className="pb-2 pr-2 font-semibold">정박 선석</th>
            <th className="pb-2 pr-2 font-semibold">출발지(직전항)</th>
            <th className="pb-2 pr-2 font-semibold">총톤수</th>
            <th className="pb-2 font-semibold">입항시각</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c, i) => (
            <tr key={`${c.callSign}-${c.vesselName}-${i}`} style={{ borderTop: "1px solid rgba(10,24,48,.06)" }}>
              <td className="py-2.5 pr-2" style={{ fontWeight: 700, color: "#0a1830" }}>
                {c.vesselName}
                {c.vesselType && (
                  <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 500, color: "#8a97b3" }}>
                    {c.vesselType}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
