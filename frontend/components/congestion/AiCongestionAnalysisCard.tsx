"use client";

import { LT } from "@/frontend/components/theme";
import { useCongestionAnalysis } from "@/frontend/hooks/useCongestionAnalysis";
import type { CongestionAnalysisRiskLevel } from "@/frontend/types/congestion-analysis";

const border = LT.border;
const muted = LT.muted;

function riskTone(risk: CongestionAnalysisRiskLevel): { label: string; color: string; bg: string } {
  if (risk === "high") return { label: "높음", color: LT.red, bg: "rgba(239,68,68,.10)" };
  if (risk === "medium") return { label: "주의", color: LT.amber, bg: "rgba(232,149,43,.14)" };
  return { label: "낮음", color: LT.green, bg: "rgba(22,163,74,.12)" };
}

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 9px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ marginBottom: 8, color: LT.ink, fontSize: 13, fontWeight: 800 }}>{title}</div>
      <div style={{ display: "grid", gap: 7 }}>
        {items.length ? (
          items.map((item) => (
            <div key={item} style={{ color: LT.inkSoft, fontSize: 12.5, lineHeight: 1.5 }}>
              {item}
            </div>
          ))
        ) : (
          <div style={{ color: muted, fontSize: 12.5 }}>표시할 항목이 없습니다.</div>
        )}
      </div>
    </div>
  );
}

export default function AiCongestionAnalysisCard() {
  const { data, loading, error, refresh } = useCongestionAnalysis();
  const analysis = data?.analysis;
  const tone = riskTone(analysis?.riskLevel ?? "low");

  return (
    <section
      style={{
        ...{
          background: LT.panelSolid,
          border,
          borderRadius: 16,
          padding: "18px 20px",
          boxShadow: LT.shadow,
          marginBottom: 18,
        },
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ marginBottom: 6, color: LT.blue, fontSize: 11, fontWeight: 900, letterSpacing: ".1em" }}>AI CONGESTION ANALYSIS</div>
          <h2 style={{ margin: 0, color: LT.ink, fontSize: 20, fontWeight: 900 }}>AI 혼잡 원인 분석</h2>
          <p style={{ margin: "8px 0 0", maxWidth: 780, color: muted, fontSize: 12.5, lineHeight: 1.55 }}>
            AIS, Port-MIS, JIT 감속 권고 결과를 바탕으로 현재 혼잡 원인과 운영 조치 방향을 요약합니다.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {analysis ? <Pill color={tone.color} bg={tone.bg}>위험 {tone.label}</Pill> : null}
          {data ? (
            <Pill color={data.isFallback ? "#b45309" : LT.green} bg={data.isFallback ? "rgba(232,149,43,.14)" : "rgba(22,163,74,.12)"}>
              {data.isFallback ? "규칙 기반 분석" : "OpenAI 분석"}
            </Pill>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            style={{
              height: 36,
              padding: "0 13px",
              borderRadius: 10,
              border: "none",
              background: loading ? "#cbd5e1" : LT.blue,
              color: "#fff",
              fontSize: 12,
              fontWeight: 800,
              cursor: loading ? "wait" : "pointer",
              boxShadow: loading ? "none" : "0 6px 16px rgba(37,99,235,.24)",
            }}
          >
            {loading ? "분석 중" : "AI 분석 새로고침"}
          </button>
        </div>
      </div>

      {loading && !data ? <div style={{ color: muted, fontSize: 13, padding: "10px 0" }}>AI 혼잡 원인 분석 생성 중...</div> : null}

      {error ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 12, borderRadius: 12, background: "rgba(239,68,68,.08)", color: LT.red, fontSize: 12.5, fontWeight: 700 }}>
          <span>AI 분석을 불러오지 못했습니다. {error}</span>
          <button type="button" onClick={refresh} style={{ border: "none", borderRadius: 8, background: LT.red, color: "#fff", height: 30, padding: "0 10px", fontWeight: 800, cursor: "pointer" }}>
            다시 시도
          </button>
        </div>
      ) : null}

      {analysis ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ padding: 14, borderRadius: 14, background: LT.tile }}>
            <div style={{ color: LT.ink, fontSize: 16, fontWeight: 900 }}>{analysis.headline}</div>
            <p style={{ margin: "8px 0 0", color: LT.inkSoft, fontSize: 13, lineHeight: 1.6 }}>{analysis.summary}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <List title="추정 원인" items={analysis.causes} />
            <List title="권고 검토 방향" items={analysis.recommendedActions} />
          </div>

          <div>
            <div style={{ marginBottom: 10, color: LT.ink, fontSize: 13, fontWeight: 900 }}>항만별 분석</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {analysis.portInsights.length ? (
                analysis.portInsights.map((insight) => (
                  <article key={insight.portId} style={{ padding: 13, borderRadius: 13, border, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ color: LT.ink, fontSize: 14 }}>{insight.portName}</strong>
                      <span style={{ color: insight.congestionLevel >= 0.6 ? LT.red : insight.congestionLevel >= 0.3 ? LT.amber : LT.green, fontSize: 13, fontWeight: 900 }}>
                        {Math.round(insight.congestionLevel * 100)}%
                      </span>
                    </div>
                    <div style={{ marginTop: 6, color: muted, fontSize: 11.5 }}>{insight.congestionStatus}</div>
                    <div style={{ marginTop: 10, color: LT.inkSoft, fontSize: 12.3, lineHeight: 1.5 }}>{insight.mainCause}</div>
                    <div style={{ marginTop: 8, color: LT.blue, fontSize: 12.3, lineHeight: 1.5, fontWeight: 700 }}>{insight.suggestedAction}</div>
                  </article>
                ))
              ) : (
                <div style={{ color: muted, fontSize: 12.5 }}>분석할 항만 데이터가 아직 없습니다.</div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <List title="위험 시간대" items={analysis.riskTimeWindows} />
            <List title="제약 사항" items={analysis.limitations} />
          </div>

          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(232,149,43,.10)", color: "#9a6a12", fontSize: 12.2, lineHeight: 1.5, fontWeight: 700 }}>
            <span>주의</span>
            <span>
              {analysis.disclaimer}
              {data?.calculationNote ? ` ${data.calculationNote}` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
