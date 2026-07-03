"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import type { CongestionForecast, Ship } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import ShipList from "@/frontend/components/ShipList";
import PortCallList from "@/frontend/components/PortCallList";
import CongestionChart from "@/frontend/components/CongestionChart";
import CongestionGauge from "@/frontend/components/CongestionGauge";
import WeatherCard from "@/frontend/components/WeatherCard";
import AdvisorPanel from "@/frontend/components/AdvisorPanel";

// Leaflet은 window에 의존하므로 서버에서 렌더링하면 안 된다.
const ShipMap = dynamic(() => import("@/frontend/components/ShipMap"), { ssr: false });

// PORTIQ 카드 공통 스타일
const card: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(10,24,48,.07)",
  borderRadius: 22,
  boxShadow: "0 10px 30px rgba(20,40,90,.06)",
};

const sectionLabel: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: ".08em",
  color: "#2f6bff",
};

// 혼잡도(0~1) → seed-port 임계값 기반 색상
function congestionColor(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "#16a34a";
  if (level <= medium) return "#e8952b";
  return "#e0483d";
}

interface KpiProps {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  hint?: string;
  gradient?: boolean;
}

function KpiCard({ label, value, unit, accent, hint, gradient }: KpiProps) {
  const dark = gradient;
  return (
    <div
      style={{
        ...card,
        padding: "18px 20px",
        ...(dark
          ? { background: "linear-gradient(135deg,#2f6bff,#4d7cff)", border: "none", color: "#fff" }
          : {}),
      }}
    >
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: dark ? "rgba(255,255,255,.85)" : "#6b7a99",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: "-.02em",
          color: dark ? "#fff" : accent ?? "#0a1830",
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginLeft: 3,
              color: dark ? "rgba(255,255,255,.85)" : "#6b7a99",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            fontWeight: 700,
            color: dark ? "rgba(255,255,255,.9)" : "#8a97b3",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [congestion, setCongestion] = useState<CongestionForecast | null>(null);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const [shipsRes, congestionRes] = await Promise.all([
        fetch("/api/ships"),
        fetch("/api/congestion"),
      ]);
      if (!active) return;
      setShips(await shipsRes.json());
      setCongestion(await congestionRes.json());
      setLoading(false);
    }

    load();
    // 30초마다 폴링해 최신 선박·혼잡도를 반영한다(목업이라 값은 고정이어도 갱신 구조는 동일).
    const timer = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const underway = ships.filter((s) => s.status === "underway").length;
  const anchored = ships.filter((s) => s.status === "anchored").length;
  const level = congestion?.currentLevel ?? 0;
  const levelPct = Math.round(level * 100);

  return (
    <div className="portiq" style={{ color: "#0a1830", background: "#f4f7ff", minHeight: "100vh" }}>
      {/* NAV */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 72,
          padding: "0 32px",
          background: "rgba(244,247,255,.72)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(10,24,48,.06)",
        }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#0a1830" }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "linear-gradient(135deg,#2f6bff,#5b8cff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px rgba(47,107,255,.35)",
            }}
          >
            <div
              style={{
                width: 11,
                height: 11,
                border: "2.5px solid #fff",
                borderRadius: "50%",
                borderRightColor: "transparent",
              }}
            />
          </div>
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-.02em" }}>PORTIQ</span>
          <span style={{ fontSize: 13, color: "#8a97b3", marginLeft: 6, fontWeight: 600 }}>
            실시간 대시보드
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#16a34a",
              background: "#eafaf0",
              padding: "6px 12px",
              borderRadius: 999,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#16a34a",
                animation: "portiq-barpulse 1.4s infinite",
              }}
            />
            LIVE · 30초 갱신
          </div>
          <Link
            href="/"
            className="portiq-link"
            style={{ fontSize: 14, fontWeight: 600, color: "#3a4a66", textDecoration: "none" }}
          >
            ← 홈으로
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 32px 64px" }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 22 }}>
          <div style={sectionLabel}>LIVE DASHBOARD</div>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: "-.03em" }}>
            {BUSAN_PORT.name} 실시간 현황
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 15, color: "#5a6785" }}>
            선박 위치·상태와 혼잡도 예측, AI 운영 권고를 한 화면에서 확인하세요.
          </p>
        </div>

        {loading ? (
          <div
            style={{
              ...card,
              padding: "60px 0",
              textAlign: "center",
              color: "#8a97b3",
              fontWeight: 600,
            }}
          >
            불러오는 중...
          </div>
        ) : (
          <>
            {/* KPI 행 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <KpiCard label="관제 중 선박" value={String(ships.length)} unit="척" hint="AIS 수신 기준" />
              <KpiCard label="항해 중" value={String(underway)} unit="척" hint="입항 접근 중" />
              <KpiCard
                label="묘박 대기"
                value={String(anchored)}
                unit="척"
                hint="접안 대기열"
              />
              <KpiCard
                label="현재 혼잡도"
                value={String(levelPct)}
                unit="%"
                accent={congestionColor(level)}
                hint={
                  level <= BUSAN_PORT.congestionThresholds.low
                    ? "원활"
                    : level <= BUSAN_PORT.congestionThresholds.medium
                      ? "보통"
                      : "혼잡"
                }
              />
            </div>

            {/* 메인 — 세로 단일 컬럼 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 기상 현황 */}
              <WeatherCard />

              {/* 지도 */}
              <section style={{ ...card, overflow: "hidden" }}>
                <div style={{ padding: "18px 22px 0" }}>
                  <div style={sectionLabel}>SHIP MAP</div>
                  <h2 style={{ margin: "6px 0 14px", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
                    실시간 선박 위치
                  </h2>
                </div>
                <div style={{ height: 460, margin: "0 -1px -1px", overflow: "hidden", borderRadius: "0 0 22px 22px" }}>
                  <ShipMap
                    ships={ships}
                    selectedMmsi={selectedMmsi}
                    onSelect={setSelectedMmsi}
                    currentLevel={level}
                  />
                </div>
              </section>

              {/* 혼잡도 — 게이지 카드 + 추이 차트 카드 분리 */}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, .8fr) 2fr", gap: 16 }}>
                <section style={{ ...card, padding: "18px 22px" }}>
                  <div style={sectionLabel}>CONGESTION</div>
                  <h2 style={{ margin: "6px 0 14px", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
                    현재 혼잡도
                  </h2>
                  <CongestionGauge level={level} />
                </section>

                <section style={{ ...card, padding: "18px 22px" }}>
                  <div style={sectionLabel}>FORECAST</div>
                  <h2 style={{ margin: "6px 0 14px", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
                    시간대별 혼잡도 예측
                  </h2>
                  {congestion && <CongestionChart forecast={congestion} />}
                </section>
              </div>

              {/* 선박 목록 (AIS 실시간 위치 기반) */}
              <section style={{ ...card, padding: "18px 22px" }}>
                <div style={sectionLabel}>FLEET · AIS</div>
                <h2 style={{ margin: "6px 0 4px", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
                  실시간 선박 (AIS)
                </h2>
                <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8a97b3" }}>
                  위치가 잡히는 선박만 표시됩니다. 부산항 전체 입출항은 아래 Port-MIS 현황을 참고하세요.
                </p>
                <ShipList ships={ships} selectedMmsi={selectedMmsi} onSelect={setSelectedMmsi} />
              </section>

              {/* 부산항 입출항·정박 현황 (Port-MIS 공식·전수) */}
              <section style={{ ...card, padding: "18px 22px" }}>
                <div style={sectionLabel}>PORT CALLS · PORT-MIS</div>
                <h2 style={{ margin: "6px 0 4px", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
                  입출항·정박 현황
                </h2>
                <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8a97b3" }}>
                  해양수산부 Port-MIS 공식 입출항 신고 — 신항 포함 부산항 전체 (선석·직전항·다음항).
                </p>
                <PortCallList />
              </section>
            </div>
          </>
        )}
      </main>

      {/* AI 어드바이저 — 화면 하단 고정 채팅 위젯 */}
      <AdvisorPanel />
    </div>
  );
}
