"use client";

import type { RouteScenarioResponse, SeaRiskAssessment, SeaRiskGrade } from "@/frontend/types/route-scenario";
import type { ScenarioShipSource } from "@/frontend/types/simulation";
import { LT } from "@/frontend/components/theme";

const muted = LT.muted;
const ink = LT.ink;
// 경로선 색은 지도(추천/후보) 시각 언어를 유지하되 밝은 배경에서 보이도록 톤만 맞춘다.
const recColor = "#0d9488"; // 추천 경로(청록)
const altColor = "#3b82f6"; // 후보 경로(파랑)
const aiColor = "#9333ea"; // AI 계산 경로(보라) — 지정항로와 구분

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatKg(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}kg`;
}

function formatScore(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function seaRiskColor(grade: SeaRiskGrade): string {
  switch (grade) {
    case "위험":
      return "#dc2626";
    case "높음":
      return "#ea580c";
    case "보통":
      return LT.blue;
    case "낮음":
      return LT.green;
    default:
      return muted;
  }
}

function SeaRiskBanner({ seaRisk }: { seaRisk: SeaRiskAssessment }) {
  const color = seaRiskColor(seaRisk.grade);
  return (
    <div
      style={{
        borderRadius: 12,
        background: `${color}14`,
        padding: 11,
        color,
        fontSize: 12,
        lineHeight: 1.5,
        fontWeight: 700,
      }}
    >
      해상 리스크: {seaRisk.grade} ({Math.round(seaRisk.level * 100)}%)
      {seaRisk.factors.length > 0 ? (
        <div style={{ marginTop: 2, color: muted, fontSize: 10.5, fontWeight: 600 }}>
          {seaRisk.factors.map((f) => `${f.label} ${f.detail}`).join(" · ")}
        </div>
      ) : (
        <div style={{ marginTop: 2, color: muted, fontSize: 10.5, fontWeight: 600 }}>{seaRisk.basis[0]}</div>
      )}
    </div>
  );
}

function MetricPill({ label, value, accent = LT.green }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 10,
        background: LT.tile,
        padding: "9px 11px",
      }}
    >
      <div style={{ color: muted, fontSize: 10, fontWeight: 800, letterSpacing: ".04em" }}>{label}</div>
      <div style={{ marginTop: 4, color: accent, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function RouteMiniChart({
  recommendedName,
  alternativeCount,
  waitMinutes,
  fuelSavedKg,
  co2ReducedKg,
}: {
  recommendedName: string;
  alternativeCount: number;
  waitMinutes: number;
  fuelSavedKg: number;
  co2ReducedKg: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        marginTop: 12,
        borderRadius: 12,
        border: "1px solid rgba(13,148,136,.18)",
        background: "rgba(13,148,136,.06)",
        padding: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ color: LT.blue, fontSize: 10, fontWeight: 800, letterSpacing: ".08em" }}>ROUTE COMPARISON</div>
          <div style={{ marginTop: 3, color: ink, fontSize: 13, fontWeight: 800 }}>{recommendedName}</div>
        </div>
        <div style={{ color: LT.green, fontSize: 11, fontWeight: 800, textAlign: "right" }}>
          대기 {waitMinutes}분 감소
          <br />
          CO₂ {formatKg(co2ReducedKg)} 감축
        </div>
      </div>

      <svg width="100%" height="74" viewBox="0 0 320 74" preserveAspectRatio="none" style={{ marginTop: 6, display: "block" }}>
        {alternativeCount > 0 && (
          <polyline
            points="12,50 72,46 132,52 190,37 252,42 308,24"
            fill="none"
            stroke={altColor}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="5 8"
            className="sim-route-card-alt"
          />
        )}
        <polyline
          points="12,56 72,48 132,43 190,31 252,26 308,15"
          fill="none"
          stroke={recColor}
          strokeWidth="3"
          strokeLinecap="round"
          className="sim-route-card-recommended"
        />
        {[12, 132, 252, 308].map((x, index) => (
          <circle key={x} cx={x} cy={[56, 43, 26, 15][index]} r={index === 3 ? 4.5 : 3.5} fill={index === 3 ? recColor : altColor} opacity="0.95" />
        ))}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: muted, fontSize: 10.5, fontWeight: 800 }}>
        <span>SHIP</span>
        <span>WAYPOINT</span>
        <span style={{ color: recColor }}>PORT</span>
      </div>
      <div style={{ marginTop: 8, color: LT.green, fontSize: 10.5, lineHeight: 1.35, fontWeight: 700 }}>
        연료 {formatKg(fuelSavedKg)} 절감 · 후보 경로 {alternativeCount}개와 비교
      </div>
    </div>
  );
}

function SimBadge({ source = "manual" }: { source?: ScenarioShipSource }) {
  const snapshot = source === "ais-snapshot";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 7px",
        borderRadius: 6,
        background: snapshot ? "rgba(37,99,235,.12)" : "rgba(232,149,43,.14)",
        color: snapshot ? LT.blue : LT.amber,
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: ".06em",
      }}
    >
      {snapshot ? "LIVE SNAPSHOT" : "SIM"}
    </span>
  );
}

export default function RouteScenarioResults({ result }: { result: RouteScenarioResponse | null }) {
  if (!result) {
    return (
      <div style={{ color: muted, fontSize: 12.5, lineHeight: 1.6 }}>
        경로 추천 계산 후 도착지별 해수부 지정항로(항만가이드라인)의 거리, ETA, 혼잡도, 예상 대기, 연료와 CO₂ 비교가 여기에 표시됩니다.
      </div>
    );
  }

  if (result.summary.recommendedCount === 0) {
    return (
      <div style={{ color: LT.inkSoft, fontSize: 12.5, lineHeight: 1.6 }}>
        <strong style={{ color: ink }}>현재 시나리오 기준으로 추천 가능한 접근 경로 후보가 없습니다.</strong>
        <br />
        {result.validation?.rejectedCount ? `입력 검증에서 ${result.validation.rejectedCount}척이 제외되었습니다.` : "선박 입력값과 도착지를 확인해주세요."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingRight: 2 }}>
      <div style={{ borderRadius: 12, background: "rgba(22,163,74,.08)", padding: 11, color: "#15803d", fontSize: 12, lineHeight: 1.5 }}>
        계산 기준: 해수부 지정항로(항만가이드라인) 비교 · 추천 {result.summary.recommendedCount}척 / 입력 {result.summary.shipCount}척
        <br />
        {result.calculationNote}
      </div>

      {result.seaRisk && <SeaRiskBanner seaRisk={result.seaRisk} />}

      {result.results.map((shipResult) => {
        const recommended = shipResult.routeScenarios.find((scenario) => scenario.isRecommended);
        return (
          <article
            key={shipResult.shipId ?? shipResult.shipName}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 14,
              border: LT.border,
              background: LT.panelSolid,
              padding: 14,
              boxShadow: LT.shadow,
            }}
          >
            <div style={{ position: "relative" }}>
              <div style={{ color: LT.blue, fontSize: 10, fontWeight: 800, letterSpacing: ".1em", marginBottom: 8 }}>ROUTE RECOMMENDATION</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SimBadge source={shipResult.scenarioSource} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {shipResult.shipName}
                </div>
                {recommended && <span style={{ color: LT.green, fontSize: 10.5, fontWeight: 800 }}>추천 #{recommended.rank}</span>}
              </div>

              <h3 style={{ margin: "10px 0 0", color: ink, fontSize: 18, lineHeight: 1.25, fontWeight: 800 }}>추천 입항 경로</h3>
              <p style={{ margin: "7px 0 0", color: muted, fontSize: 11.5, lineHeight: 1.5 }}>
                {shipResult.destinationPortName} 기준으로 {shipResult.recommendedRouteName ?? "-"} 후보가 가장 낮은 MVP 가중 비교 점수를 기록했습니다.
              </p>

              {recommended && (
                <RouteMiniChart
                  recommendedName={recommended.routeName}
                  alternativeCount={shipResult.routeScenarios.filter((scenario) => !scenario.isRecommended).length}
                  waitMinutes={recommended.reducedWaitingMinutes}
                  fuelSavedKg={recommended.estimatedFuelSavedKg}
                  co2ReducedKg={recommended.estimatedCo2ReducedKg}
                />
              )}

              {shipResult.advisor && (
                <section style={{ marginTop: 10, borderRadius: 12, background: LT.blueSoft, padding: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <h3 style={{ margin: 0, color: LT.blue, fontSize: 12, fontWeight: 800 }}>AI 추천 사유</h3>
                    <span style={{ color: muted, fontSize: 10, fontWeight: 800 }}>{shipResult.advisor.source}</span>
                  </div>
                  <p style={{ margin: "7px 0 0", color: muted, fontSize: 10.5, lineHeight: 1.45 }}>
                    아래 설명은 백엔드 계산 결과를 바탕으로 생성된 운영자 검토용 요약입니다.
                  </p>
                  <p style={{ margin: "8px 0 0", color: LT.inkSoft, fontSize: 11.5, lineHeight: 1.5 }}>
                    {shipResult.advisor.summary}
                  </p>
                  <p style={{ margin: "6px 0 0", color: LT.inkSoft, fontSize: 11.5, lineHeight: 1.5 }}>
                    {shipResult.advisor.recommendation}
                  </p>
                  {shipResult.advisor.reasons.slice(0, 3).map((reason) => (
                    <div key={reason} style={{ marginTop: 6, color: "#1e40af", fontSize: 10.5, lineHeight: 1.35 }}>
                      {reason}
                    </div>
                  ))}
                  {shipResult.advisor.comparison.slice(0, 2).map((item) => (
                    <div key={item} style={{ marginTop: 6, color: LT.inkSoft, fontSize: 10.5, lineHeight: 1.35 }}>
                      비교: {item}
                    </div>
                  ))}
                  {shipResult.advisor.risks.slice(0, 2).map((risk) => (
                    <div key={risk} style={{ marginTop: 6, color: "#b45309", fontSize: 10.5, lineHeight: 1.35 }}>
                      {risk}
                    </div>
                  ))}
                  <div style={{ marginTop: 7, color: "#b45309", fontSize: 10.5, lineHeight: 1.35 }}>
                    {shipResult.advisor.disclaimer}
                  </div>
                </section>
              )}

              {recommended && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                  <MetricPill label="추천 경로" value={recommended.routeShortName} accent={recColor} />
                  <MetricPill label="도착지" value={shipResult.destinationPortName} accent={ink} />
                  <MetricPill label="거리" value={`${recommended.distanceNm}NM`} accent={LT.blue} />
                  <MetricPill label="ETA" value={formatDateTime(recommended.eta)} accent={LT.blue} />
                  <MetricPill label="권고 속도" value={`${recommended.recommendedSpeedKn}kn`} accent={ink} />
                  <MetricPill label="예상 대기" value={`${recommended.estimatedWaitingMinutes}분`} accent={LT.amber} />
                  <MetricPill label="연료 절감" value={formatKg(recommended.estimatedFuelSavedKg)} accent={LT.green} />
                  <MetricPill label="CO₂ 감축" value={formatKg(recommended.estimatedCo2ReducedKg)} accent={LT.green} />
                  <MetricPill
                    label="해상 리스크"
                    value={`${recommended.seaRisk.grade} (${Math.round(recommended.seaRisk.level * 100)}%)`}
                    accent={seaRiskColor(recommended.seaRisk.grade)}
                  />
                </div>
              )}

              {recommended?.reasons.slice(0, 3).map((reason) => (
                <div key={reason} style={{ marginTop: 7, color: muted, fontSize: 10.5, lineHeight: 1.35 }}>
                  {reason}
                </div>
              ))}

              <div style={{ marginTop: 12, overflowX: "auto", borderRadius: 12, border: LT.border, background: LT.panelSolid }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560, color: LT.inkSoft, fontSize: 11 }}>
                  <thead>
                    <tr style={{ color: muted, textAlign: "left" }}>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>순위</th>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>경로</th>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>거리</th>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>대기</th>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>연료 절감</th>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>CO₂ 감축</th>
                      <th style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipResult.routeScenarios.map((scenario) => {
                      const isAiRoute = scenario.routeSource === "ai-computed-route";
                      const lineColor = isAiRoute ? aiColor : scenario.isRecommended ? recColor : altColor;
                      return (
                      <tr key={scenario.routeId} style={{ color: scenario.isRecommended ? "#0f766e" : LT.inkSoft, background: scenario.isRecommended ? "rgba(13,148,136,.07)" : "transparent" }}>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}`, fontWeight: 800 }}>
                          {scenario.rank}{scenario.isRecommended ? " · 추천" : ""}
                        </td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>
                          <span style={{ display: "inline-block", width: 24, borderTop: scenario.isRecommended ? `2px solid ${lineColor}` : `2px dashed ${lineColor}`, marginRight: 7, transform: "translateY(-3px)" }} />
                          {scenario.routeShortName}
                          {isAiRoute && (
                            <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, color: aiColor, background: "rgba(147,51,234,.12)", padding: "1px 5px", borderRadius: 5 }}>
                              AI
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>{scenario.distanceNm}NM</td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>{scenario.estimatedWaitingMinutes}분</td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>{formatKg(scenario.estimatedFuelSavedKg)}</td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>{formatKg(scenario.estimatedCo2ReducedKg)}</td>
                        <td style={{ padding: "7px 8px", borderBottom: `1px solid ${LT.borderColor}` }}>{formatScore(scenario.score)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(recommended?.warnings ?? shipResult.warnings).slice(0, 2).map((warning) => (
                <div key={warning} style={{ marginTop: 8, color: "#b45309", fontSize: 10.5, lineHeight: 1.35 }}>
                  {warning}
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
