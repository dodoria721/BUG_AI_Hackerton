"use client";

// 감속 권고(JIT 정시도착) 카드 — 혼잡도로 예상 대기시간을 내고, 접근 중인 선박이
// "전속 후 묘박대기" 대신 감속하면 아낄 수 있는 연료·CO2·비용을 보여준다.
// 계산은 backend/prediction 순수 함수를 클라이언트에서 그대로 호출(대시보드의 기존 패턴).

import { useMemo } from "react";
import type { Ship } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import { haversineDistanceKm } from "@/backend/prediction/eta";
import { recommendSpeed, type SpeedAdvisory } from "@/backend/prediction/speed-advisory";

const KM_TO_NM = 1 / 1.852;
const muted = "#8aa0c8";
const panel = "rgba(11,18,34,0.82)";
const border = "1px solid rgba(120,160,255,0.14)";

// 접근 선박 판정: 항해 중 + 항 중심에서 10~600해리 + 유의미한 속력.
function approachingShips(ships: Ship[]): { ship: Ship; distanceNm: number }[] {
  const out: { ship: Ship; distanceNm: number }[] = [];
  for (const s of ships) {
    if (s.status !== "underway" || s.sog < 3) continue;
    const distanceNm = haversineDistanceKm({ lat: s.lat, lon: s.lon }, BUSAN_PORT.center) * KM_TO_NM;
    if (distanceNm >= 10 && distanceNm <= 600) out.push({ ship: s, distanceNm });
  }
  return out;
}

interface Props {
  ships: Ship[];
  level: number; // 현재 혼잡도(0~1) — 상단 텔레메트리와 동일 값
}

export default function SpeedAdvisoryCard({ ships, level }: Props) {
  const { rows, agg, waitHours } = useMemo(() => {
    // 혼잡도(level)를 동일 의미의 "동시 재항 척수"로 환산해 recommendSpeed에 넣는다.
    const inPortEquiv = level * BUSAN_PORT.portCallCapacity.portWide.p99;
    const approaching = approachingShips(ships);

    const rows = approaching
      .map(({ ship, distanceNm }) => {
        const adv: SpeedAdvisory = recommendSpeed(
          {
            vesselType: undefined, // AIS엔 선종이 없어 기본 프로필 사용
            grossTonnage: ship.grossTonnage,
            distanceNm,
            currentSpeedKn: ship.sog,
            currentInPort: inPortEquiv,
          },
          BUSAN_PORT
        );
        return { ship, adv };
      })
      .filter((r) => r.adv.savings.fuelTon > 0)
      .sort((a, b) => b.adv.savings.fuelTon - a.adv.savings.fuelTon);

    const agg = rows.reduce(
      (a, r) => ({
        fuelTon: a.fuelTon + r.adv.savings.fuelTon,
        co2Ton: a.co2Ton + r.adv.savings.co2Ton,
        costUsd: a.costUsd + r.adv.savings.fuelCostUsd,
      }),
      { fuelTon: 0, co2Ton: 0, costUsd: 0 }
    );
    // 대표 대기시간(가장 큰 절감 선박 기준, 없으면 컨테이너 기본)
    const waitHours = rows[0]?.adv.waitHoursIfFullSpeed ?? 0;
    return { rows, agg, waitHours };
  }, [ships, level]);

  const pct = Math.round(level * 100);
  const hasSavings = rows.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 84,
        width: 340,
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
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 15 }}>⚓</span>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em" }}>감속 권고 · JIT 정시도착</span>
        </div>
        <span style={{ fontSize: 9.5, color: muted, fontWeight: 700, letterSpacing: ".06em" }}>연료저감</span>
      </div>
      <div style={{ fontSize: 10.5, color: muted, fontWeight: 600, marginBottom: 10 }}>
        혼잡도 <b style={{ color: pct >= 60 ? "#fbbf24" : "#34d399" }}>{pct}%</b>
        {hasSavings ? (
          <>
            {" "}· 전속 도착 시 예상 대기 <b style={{ color: "#fbbf24" }}>{waitHours}h</b>
          </>
        ) : (
          " · 원활 — 감속 권고 없음"
        )}
      </div>

      {hasSavings ? (
        <>
          {/* 집계 절감 (3분할 stat) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "연료 절감", value: agg.fuelTon.toFixed(1), unit: "t", accent: "#38bdf8" },
              { label: "CO₂ 감축", value: agg.co2Ton.toFixed(0), unit: "t", accent: "#34d399" },
              { label: "비용 절감", value: `$${(agg.costUsd / 1000).toFixed(1)}k`, unit: "", accent: "#a78bfa" },
            ].map((s) => (
              <div
                key={s.label}
                style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}
              >
                <div style={{ fontSize: 17, fontWeight: 800, color: s.accent, lineHeight: 1.1 }}>
                  {s.value}
                  {s.unit && <span style={{ fontSize: 10, color: muted, marginLeft: 1 }}>{s.unit}</span>}
                </div>
                <div style={{ fontSize: 9.5, color: muted, fontWeight: 700, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 접근 선박별 권고 (상위 4척) */}
          <div style={{ fontSize: 9.5, color: muted, fontWeight: 800, letterSpacing: ".06em", marginBottom: 5 }}>
            접근 선박 {rows.length}척 · 감속 권고
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.slice(0, 4).map(({ ship, adv }) => (
              <div
                key={ship.mmsi}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 9px",
                  background: "rgba(255,255,255,.03)",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#c7d3ea", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 118 }}>
                  {ship.name}
                </span>
                <span style={{ fontSize: 11, color: muted, whiteSpace: "nowrap" }}>
                  {ship.sog.toFixed(0)}→<b style={{ color: "#38bdf8" }}>{adv.recommendedSpeedKn}</b>kn
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399", whiteSpace: "nowrap" }}>
                  −{adv.savings.fuelTon.toFixed(1)}t
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: muted, marginTop: 8, lineHeight: 1.4 }}>
            2019~2024 입출항 실측 기반 · 전속 후 묘박대기 대비
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: muted, padding: "6px 0 2px", lineHeight: 1.5 }}>
          현재 항만이 원활해 감속 이득이 없습니다. 혼잡도가 오르면 접근 선박별 최적 감속 속도와
          절감량을 표시합니다.
        </div>
      )}
    </div>
  );
}
