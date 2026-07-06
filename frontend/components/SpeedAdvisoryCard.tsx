"use client";

import { useEffect, useState } from "react";
import type { Ship } from "@/backend/ports/port-types";
import type { EnergyDecision, EnergyDecisionResult } from "@/backend/prediction/energy-decision";

const muted = "#8aa0c8";
const panel = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";

interface Props {
  ships: Ship[];
  level: number;
}

function confidenceLabel(confidence: EnergyDecision["confidence"]): string {
  if (confidence === "high") return "높음";
  if (confidence === "medium") return "보통";
  return "낮음";
}

function kgToDisplay(kg: number): { value: string; unit: string } {
  if (kg >= 1000) return { value: (kg / 1000).toFixed(1), unit: "t" };
  return { value: Math.round(kg).toLocaleString("ko-KR"), unit: "kg" };
}

export default function SpeedAdvisoryCard({ level }: Props) {
  const [data, setData] = useState<EnergyDecisionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/energy-decisions", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as EnergyDecisionResult);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "unknown");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [level]);

  const decisions = data?.decisions ?? [];
  const summary = data?.summary;
  const hasSavings = decisions.length > 0;
  const pct = Math.round(level * 100);
  const fuel = kgToDisplay(summary?.totalEstimatedFuelSavedKg ?? 0);
  const co2 = kgToDisplay(summary?.totalEstimatedCo2ReducedKg ?? 0);

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 84,
        width: 370,
        zIndex: 500,
        padding: "14px 16px 12px",
        background: panel,
        backdropFilter: "blur(14px)",
        border,
        borderRadius: 14,
        color: "#e7ecf5",
        fontFamily: "Pretendard, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em" }}>감속 권고 · JIT 정시도착</span>
        <span style={{ fontSize: 9.5, color: muted, fontWeight: 700, letterSpacing: ".06em" }}>연료·탄소</span>
      </div>

      <div style={{ fontSize: 10.5, color: muted, fontWeight: 600, marginBottom: 10 }}>
        현재 혼잡도 <b style={{ color: pct >= 60 ? "#fbbf24" : "#34d399" }}>{pct}%</b>
        {loading ? (
          " · 계산 중"
        ) : hasSavings ? (
          <>
            {" "}· 권고 <b style={{ color: "#fbbf24" }}>{summary?.recommendedCount ?? 0}척</b>
          </>
        ) : (
          " · JIT 감속 권고 없음"
        )}
      </div>

      {hasSavings ? (
        <>
          <SummaryStats
            waitMinutes={summary?.totalReducedWaitingMinutes ?? 0}
            fuel={fuel}
            co2={co2}
          />

          <div style={{ fontSize: 9.5, color: muted, fontWeight: 800, letterSpacing: ".06em", marginBottom: 5 }}>
            접근 선박 {summary?.candidateCount ?? 0}척 · 감속 권고
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {decisions.slice(0, 4).map((decision) => (
              <DecisionRow key={decision.shipId ?? decision.shipName} decision={decision} />
            ))}
          </div>

          <div style={{ fontSize: 9, color: muted, marginTop: 8, lineHeight: 1.4 }}>
            {data?.calculationNote ?? "연료 절감량과 CO2 감축량은 선박 크기, 속도, 혼잡도 기반 추정값입니다."}
          </div>
        </>
      ) : (
        <EmptyState loading={loading} error={error} data={data} />
      )}
    </div>
  );
}

function SummaryStats({
  waitMinutes,
  fuel,
  co2,
}: {
  waitMinutes: number;
  fuel: { value: string; unit: string };
  co2: { value: string; unit: string };
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
      {[
        { label: "대기 감소", value: String(waitMinutes), unit: "분", accent: "#fbbf24" },
        { label: "연료 절감", value: fuel.value, unit: fuel.unit, accent: "#38bdf8" },
        { label: "CO2 감축", value: co2.value, unit: co2.unit, accent: "#34d399" },
      ].map((s) => (
        <div
          key={s.label}
          style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, color: s.accent, lineHeight: 1.1 }}>
            {s.value}
            <span style={{ fontSize: 10, color: muted, marginLeft: 2 }}>{s.unit}</span>
          </div>
          <div style={{ fontSize: 9.5, color: muted, fontWeight: 700, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: EnergyDecisionResult | null;
}) {
  if (loading) {
    return (
      <div style={{ fontSize: 11.5, color: muted, padding: "6px 0 2px", lineHeight: 1.5 }}>
        Port-MIS 혼잡도와 AIS 선박 위치를 기준으로 JIT 감속 권고를 계산하고 있습니다.
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 11.5, color: muted, padding: "6px 0 2px", lineHeight: 1.5 }}>
        감속 권고 데이터를 불러오지 못했습니다.
      </div>
    );
  }

  const summary = data?.summary;
  const freshness = data?.forecastFreshness;
  const emptyReason = data?.emptyReason;

  return (
    <div style={{ fontSize: 11.5, color: muted, padding: "4px 0 2px", lineHeight: 1.5 }}>
      <div style={{ color: "#e7ecf5", fontWeight: 800, marginBottom: 6 }}>
        {emptyReason?.title ?? "현재 JIT 감속 권고 대상 선박이 없습니다."}
      </div>
      <div style={{ marginBottom: 8 }}>
        {emptyReason?.description ??
          "현재 또는 ETA 시간대 혼잡도가 낮거나, 접근 중인 선박이 감속 권고 조건을 만족하지 않습니다."}
      </div>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 8 }}>
          <MiniMetric label="접근 후보" value={`${summary.candidateCount}척`} />
          <MiniMetric label="ETA 매칭" value={`${summary.etaForecastMatchedCount}척`} />
          <MiniMetric label="fallback" value={`${summary.currentLevelFallbackCount}척`} />
          <MiniMetric label="낮은 혼잡" value={`${summary.lowCongestionSkippedCount}척`} />
        </div>
      )}

      {freshness?.isStale && (
        <div style={{ padding: "7px 8px", background: "rgba(251,191,36,.08)", borderRadius: 8, color: "#fbbf24" }}>
          혼잡도 예측 데이터가 최신 선박 ETA 범위를 벗어나 currentLevel fallback 기준으로 계산 중입니다.
          Port-MIS 데이터를 최신화하면 ETA 시간대 기반 권고가 활성화될 수 있습니다.
        </div>
      )}

      {emptyReason?.suggestions?.length ? (
        <div style={{ marginTop: 8 }}>
          {emptyReason.suggestions.slice(0, 3).map((suggestion) => (
            <div key={suggestion} style={{ marginTop: 3 }}>
              · {suggestion}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ fontSize: 9, color: muted, marginTop: 8, lineHeight: 1.4 }}>
        {data?.calculationNote ?? "연료 절감량과 CO2 감축량은 선박 크기, 속도, 혼잡도 기반 추정값입니다."}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "5px 7px" }}>
      <div style={{ fontSize: 9.5, color: muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#e7ecf5", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function DecisionRow({ decision }: { decision: EnergyDecision }) {
  const fuel = kgToDisplay(decision.estimatedFuelSavedKg);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto auto",
        alignItems: "center",
        gap: 8,
        padding: "6px 9px",
        background: "rgba(255,255,255,.03)",
        borderRadius: 8,
      }}
    >
      <span
        title={`${decision.shipName} · 신뢰도 ${confidenceLabel(decision.confidence)}`}
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: "#c7d3ea",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {decision.shipName}
      </span>
      <span style={{ fontSize: 11, color: muted, whiteSpace: "nowrap" }}>
        {decision.currentSpeedKn.toFixed(0)}→
        <b style={{ color: "#38bdf8" }}>{decision.recommendedSpeedKn.toFixed(1)}</b>kn
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399", whiteSpace: "nowrap" }}>
        {fuel.value}
        {fuel.unit}
      </span>
      <span style={{ gridColumn: "1 / -1", fontSize: 9.5, color: muted, lineHeight: 1.25 }}>
        대기 {decision.currentWaitingMinutes}분→{decision.optimizedWaitingMinutes}분 · {decision.currentCongestionStatus} · 신뢰도{" "}
        {confidenceLabel(decision.confidence)}
      </span>
    </div>
  );
}
