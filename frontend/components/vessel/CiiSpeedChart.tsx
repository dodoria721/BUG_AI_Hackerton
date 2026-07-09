"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CiiCurvePoint } from "@/frontend/config/vessel-display";
import { LT } from "@/frontend/components/theme";

interface CiiSpeedChartProps {
  data: CiiCurvePoint[];
  selectedPoint: CiiCurvePoint;
}

const muted = LT.muted;

export default function CiiSpeedChart({ data, selectedPoint }: CiiSpeedChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <CartesianGrid stroke="rgba(15,23,42,.06)" vertical={false} />
        <XAxis dataKey="speed" tick={{ fill: muted, fontSize: 10 }} stroke="rgba(15,23,42,.12)" tickLine={false} />
        <YAxis tick={{ fill: muted, fontSize: 10 }} stroke="rgba(15,23,42,.12)" tickLine={false} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#fff", border: LT.border, borderRadius: 10, fontSize: 12, boxShadow: LT.shadow }}
          labelStyle={{ color: muted }}
          formatter={(val: number) => [val.toFixed(3), "CII"]}
          labelFormatter={(label) => `${label} kn`}
        />
        <Line type="monotone" dataKey="cii" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
        <ReferenceDot
          x={selectedPoint.speed}
          y={selectedPoint.cii}
          r={6}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={2}
          label={{ value: `현재 ${selectedPoint.speed.toFixed(1)}kn`, position: "top", fill: "#d97706", fontSize: 11, fontWeight: 800 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
