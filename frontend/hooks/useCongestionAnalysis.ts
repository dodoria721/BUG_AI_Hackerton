"use client";

import { useCallback, useEffect, useState } from "react";
import type { CongestionAnalysisApiResponse } from "@/frontend/types/congestion-analysis";

export function useCongestionAnalysis() {
  const [data, setData] = useState<CongestionAnalysisApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/congestion/analysis", { cache: "no-store" });
      if (!response.ok) throw new Error(`AI 혼잡 분석 요청 실패 (${response.status})`);
      setData((await response.json()) as CongestionAnalysisApiResponse);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI 분석을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
