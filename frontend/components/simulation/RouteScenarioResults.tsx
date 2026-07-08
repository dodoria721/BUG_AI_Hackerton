"use client";

import type { RouteScenarioResponse } from "@/frontend/types/route-scenario";
import type { ScenarioShipSource } from "@/frontend/types/simulation";

const text = "#e7ecf5";
const muted = "#8aa0c8";

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

function MetricPill({ label, value, accent = "#5eead4" }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 8,
        border: "1px solid rgba(120,160,255,.14)",
        background: "rgba(255,255,255,.045)",
        padding: "9px 10px",
      }}
    >
      <div style={{ color: muted, fontSize: 10, fontWeight: 900, letterSpacing: ".04em" }}>{label}</div>
      <div style={{ marginTop: 4, color: accent, fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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
        borderRadius: 8,
        border: "1px solid rgba(94,234,212,.16)",
        background: "linear-gradient(160deg,rgba(15,23,42,.86),rgba(13,31,74,.56))",
        padding: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#7fa5ff", fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>ROUTE COMPARISON</div>
          <div style={{ marginTop: 3, color: text, fontSize: 13, fontWeight: 900 }}>{recommendedName}</div>
        </div>
        <div style={{ color: "#5eead4", fontSize: 11, fontWeight: 900, textAlign: "right" }}>
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
            stroke="#60a5fa"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="5 8"
            className="sim-route-card-alt"
          />
        )}
        <polyline
          points="12,56 72,48 132,43 190,31 252,26 308,15"
          fill="none"
          stroke="#5eead4"
          strokeWidth="3"
          strokeLinecap="round"
          className="sim-route-card-recommended"
        />
        {[12, 132, 252, 308].map((x, index) => (
          <circle key={x} cx={x} cy={[56, 43, 26, 15][index]} r={index === 3 ? 4.5 : 3.5} fill={index === 3 ? "#5eead4" : "#22d3ee"} opacity="0.95" />
        ))}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: muted, fontSize: 10.5, fontWeight: 800 }}>
        <span>SHIP</span>
        <span>WAYPOINT</span>
        <span style={{ color: "#5eead4" }}>PORT</span>
      </div>
      <div style={{ marginTop: 8, color: "#bbf7d0", fontSize: 10.5, lineHeight: 1.35 }}>
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
        background: snapshot ? "rgba(59,130,246,.18)" : "rgba(250,204,21,.16)",
        color: snapshot ? "#bfdbfe" : "#fde68a",
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
        경로 추천 계산 후 도착지별 사전 정의 접근 경로 후보의 거리, ETA, 혼잡도, 예상 대기, 연료와 CO₂ 비교가 여기에 표시됩니다.
      </div>
    );
  }

  if (result.summary.recommendedCount === 0) {
    return (
      <div style={{ color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.6 }}>
        <strong style={{ color: text }}>현재 시나리오 기준으로 추천 가능한 접근 경로 후보가 없습니다.</strong>
        <br />
        {result.validation?.rejectedCount ? `입력 검증에서 ${result.validation.rejectedCount}척이 제외되었습니다.` : "선박 입력값과 도착지를 확인해주세요."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingRight: 2 }}>
      <div style={{ borderRadius: 8, border: "1px solid rgba(34,197,94,.18)", background: "rgba(34,197,94,.08)", padding: 10, color: "#bbf7d0", fontSize: 12, lineHeight: 1.5 }}>
        계산 기준: 사전 정의 접근 경로 후보 비교 · 추천 {result.summary.recommendedCount}척 / 입력 {result.summary.shipCount}척
        <br />
        {result.calculationNote}
      </div>

      {result.results.map((shipResult) => {
        const recommended = shipResult.routeScenarios.find((scenario) => scenario.isRecommended);
        return (
          <article
            key={shipResult.shipId ?? shipResult.shipName}
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 8,
              border: "1px solid rgba(120,160,255,.2)",
              background: "linear-gradient(160deg,#12275a,#0a1830 62%,#081122)",
              padding: 14,
              boxShadow: "0 18px 44px rgba(0,0,0,.24)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "0 auto auto 0",
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: "radial-gradient(circle,rgba(94,234,212,.18),transparent 68%)",
                transform: "translate(-40%,-45%)",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
            <div style={{ color: "#7fa5ff", fontSize: 10, fontWeight: 900, letterSpacing: ".1em", marginBottom: 8 }}>ROUTE RECOMMENDATION</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SimBadge source={shipResult.scenarioSource} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shipResult.shipName}
              </div>
              {recommended && <span style={{ color: "#bbf7d0", fontSize: 10.5, fontWeight: 900 }}>추천 #{recommended.rank}</span>}
            </div>

            <h3 style={{ margin: "10px 0 0", color: text, fontSize: 18, lineHeight: 1.25, fontWeight: 900 }}>추천 입항 경로</h3>
            <p style={{ margin: "7px 0 0", color: "#cbd5e1", fontSize: 11.5, lineHeight: 1.5 }}>
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
              <section style={{ marginTop: 10, borderRadius: 8, border: "1px solid rgba(96,165,250,.18)", background: "rgba(59,130,246,.08)", padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <h3 style={{ margin: 0, color: "#bfdbfe", fontSize: 12, fontWeight: 900 }}>AI 추천 사유</h3>
                  <span style={{ color: muted, fontSize: 10, fontWeight: 900 }}>{shipResult.advisor.source}</span>
                </div>
                <p style={{ margin: "7px 0 0", color: muted, fontSize: 10.5, lineHeight: 1.45 }}>
                  아래 설명은 백엔드 계산 결과를 바탕으로 생성된 운영자 검토용 요약입니다.
                </p>
                <p style={{ margin: "8px 0 0", color: "#dbeafe", fontSize: 11.5, lineHeight: 1.5 }}>
                  {shipResult.advisor.summary}
                </p>
                <p style={{ margin: "6px 0 0", color: "#cbd5e1", fontSize: 11.5, lineHeight: 1.5 }}>
                  {shipResult.advisor.recommendation}
                </p>
                {shipResult.advisor.reasons.slice(0, 3).map((reason) => (
                  <div key={reason} style={{ marginTop: 6, color: "#bfdbfe", fontSize: 10.5, lineHeight: 1.35 }}>
                    {reason}
                  </div>
                ))}
                {shipResult.advisor.comparison.slice(0, 2).map((item) => (
                  <div key={item} style={{ marginTop: 6, color: "#cbd5e1", fontSize: 10.5, lineHeight: 1.35 }}>
                    비교: {item}
                  </div>
                ))}
                {shipResult.advisor.risks.slice(0, 2).map((risk) => (
                  <div key={risk} style={{ marginTop: 6, color: "#fde68a", fontSize: 10.5, lineHeight: 1.35 }}>
                    {risk}
                  </div>
                ))}
                <div style={{ marginTop: 7, color: "#fde68a", fontSize: 10.5, lineHeight: 1.35 }}>
                  {shipResult.advisor.disclaimer}
                </div>
              </section>
            )}

            {recommended && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <MetricPill label="추천 경로" value={recommended.routeShortName} />
                <MetricPill label="도착지" value={shipResult.destinationPortName} />
                <MetricPill label="거리" value={`${recommended.distanceNm}NM`} accent="#bfdbfe" />
                <MetricPill label="ETA" value={formatDateTime(recommended.eta)} accent="#bfdbfe" />
                <MetricPill label="권고 속도" value={`${recommended.recommendedSpeedKn}kn`} />
                <MetricPill label="예상 대기" value={`${recommended.estimatedWaitingMinutes}분`} accent="#fde68a" />
                <MetricPill label="연료 절감" value={formatKg(recommended.estimatedFuelSavedKg)} />
                <MetricPill label="CO₂ 감축" value={formatKg(recommended.estimatedCo2ReducedKg)} />
              </div>
            )}

            {recommended?.reasons.slice(0, 3).map((reason) => (
              <div key={reason} style={{ marginTop: 7, color: muted, fontSize: 10.5, lineHeight: 1.35 }}>
                {reason}
              </div>
            ))}

            <div style={{ marginTop: 12, overflowX: "auto", borderRadius: 8, border: "1px solid rgba(148,163,184,.12)", background: "rgba(255,255,255,.035)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560, color: "#cbd5e1", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: muted, textAlign: "left" }}>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>순위</th>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>경로</th>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>거리</th>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>대기</th>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>연료 절감</th>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>CO₂ 감축</th>
                    <th style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.14)" }}>점수</th>
                  </tr>
                </thead>
                <tbody>
                  {shipResult.routeScenarios.map((scenario) => (
                    <tr key={scenario.routeId} style={{ color: scenario.isRecommended ? "#bbf7d0" : "#cbd5e1", background: scenario.isRecommended ? "rgba(94,234,212,.06)" : "transparent" }}>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)", fontWeight: 900 }}>
                        {scenario.rank}{scenario.isRecommended ? " · 추천" : ""}
                      </td>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>
                        <span style={{ display: "inline-block", width: 24, borderTop: scenario.isRecommended ? "2px solid #5eead4" : "2px dashed #60a5fa", marginRight: 7, transform: "translateY(-3px)" }} />
                        {scenario.routeShortName}
                      </td>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{scenario.distanceNm}NM</td>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{scenario.estimatedWaitingMinutes}분</td>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{formatKg(scenario.estimatedFuelSavedKg)}</td>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{formatKg(scenario.estimatedCo2ReducedKg)}</td>
                      <td style={{ padding: "7px 6px", borderBottom: "1px solid rgba(148,163,184,.08)" }}>{formatScore(scenario.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(recommended?.warnings ?? shipResult.warnings).slice(0, 2).map((warning) => (
              <div key={warning} style={{ marginTop: 8, color: "#fde68a", fontSize: 10.5, lineHeight: 1.35 }}>
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
