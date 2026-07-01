"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { CongestionForecast, Ship } from "@/backend/ports/port-types";
import ShipList from "@/frontend/components/ShipList";
import CongestionChart from "@/frontend/components/CongestionChart";
import AdvisorPanel from "@/frontend/components/AdvisorPanel";

// Leaflet은 window에 의존하므로 서버에서 렌더링하면 안 된다.
const ShipMap = dynamic(() => import("@/frontend/components/ShipMap"), { ssr: false });

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

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">부산항 대시보드</h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          실시간 선박 현황과 혼잡도 예측, AI 운영 권고
        </p>
      </header>

      {loading ? (
        <p className="text-[var(--color-ink-soft)]">불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="h-[480px] overflow-hidden rounded-xl border border-white/10 lg:col-span-2">
            <ShipMap
              ships={ships}
              selectedMmsi={selectedMmsi}
              onSelect={setSelectedMmsi}
              currentLevel={congestion?.currentLevel ?? 0}
            />
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 font-medium">혼잡도 예측</h2>
            {congestion && <CongestionChart forecast={congestion} />}
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--color-surface)] p-4 lg:col-span-2">
            <h2 className="mb-3 font-medium">선박 목록</h2>
            <ShipList ships={ships} selectedMmsi={selectedMmsi} onSelect={setSelectedMmsi} />
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 font-medium">AI 어드바이저</h2>
            <AdvisorPanel />
          </section>
        </div>
      )}
    </main>
  );
}
