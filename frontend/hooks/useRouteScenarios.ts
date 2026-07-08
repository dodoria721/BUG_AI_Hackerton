"use client";

import { useCallback, useState } from "react";
import type { RouteScenarioResponse } from "@/frontend/types/route-scenario";
import type { SimulatedShip } from "@/frontend/types/simulation";

export function useRouteScenarios() {
  const [result, setResult] = useState<RouteScenarioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resetRouteScenarios = useCallback(() => {
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const calculateRouteScenarios = useCallback(async (scenarioShips: SimulatedShip[]) => {
    setError(null);
    setNotice(null);

    if (scenarioShips.length === 0) {
      setNotice("가상 선박 또는 LIVE SNAPSHOT 선박을 먼저 추가한 뒤 경로 추천을 계산해주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/route-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "simulation", congestionMode: "dashboard-current", scenarioShips }),
      });

      if (!response.ok) {
        throw new Error(`경로 추천 계산 요청 실패 (${response.status})`);
      }

      const nextResult = (await response.json()) as RouteScenarioResponse;
      setResult(nextResult);
      if (nextResult.summary.recommendedCount === 0) {
        setNotice("비교 가능한 접근 경로 추천 결과가 없습니다. 선박 입력값과 도착지를 확인해주세요.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "경로 추천 계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    result,
    loading,
    error,
    notice,
    calculateRouteScenarios,
    resetRouteScenarios,
  };
}
