// 파랑·해양기상·태풍·선박운항지수 소스를 모아 backend/prediction/sea-risk.ts 의
// computeSeaRisk() 입력을 만든다. 각 소스는 키 미설정이면 null, 파싱 미구현이면 예외를
// 던질 수 있으므로 Promise.allSettled 로 모아 하나가 실패해도 나머지 값으로 계산을 이어간다.

import { haversineDistanceKm } from "../prediction/eta";
import { computeSeaRisk, type SeaRiskAssessment } from "../prediction/sea-risk";
import { BUSAN_PORT } from "../ports/seed-port";
import { fetchWaveObservation } from "./wave";
import { fetchMarineWeather } from "./weather";
import { fetchActiveTyphoons } from "./typhoon";
import { fetchShipOperationIndex } from "./operationIndex";
import type { TyphoonInfo } from "./types";

function settledValue<T>(result: PromiseSettledResult<T | null>): T | undefined {
  return result.status === "fulfilled" && result.value != null ? result.value : undefined;
}

function nearestTyphoonDistanceKm(typhoons: TyphoonInfo[]): number | undefined {
  let nearest: number | undefined;
  for (const typhoon of typhoons) {
    const latest = typhoon.track.at(-1);
    if (!latest) continue;
    const distanceKm = haversineDistanceKm(BUSAN_PORT.center, { lat: latest.lat, lon: latest.lon });
    if (nearest === undefined || distanceKm < nearest) nearest = distanceKm;
  }
  return nearest;
}

/**
 * 부산항 인근 해상 리스크를 평가한다. 개별 소스가 미설정/오류여도 예외를 던지지 않고
 * 사용 가능한 값만으로 계산하며, 하나도 없으면 grade="정보없음"을 반환한다.
 */
export async function fetchSeaRiskAssessment(): Promise<SeaRiskAssessment> {
  const [waveResult, weatherResult, typhoonResult, operationIndexResult] = await Promise.allSettled([
    fetchWaveObservation(),
    fetchMarineWeather(),
    fetchActiveTyphoons(),
    fetchShipOperationIndex(),
  ]);

  const wave = settledValue(waveResult);
  const weather = settledValue(weatherResult);
  const typhoons = settledValue(typhoonResult);
  const operationIndex = settledValue(operationIndexResult);

  return computeSeaRisk({
    waveHeightM: wave?.waveHeightM,
    windSpeedMs: weather?.windSpeedMs,
    typhoonDistanceKm: typhoons?.length ? nearestTyphoonDistanceKm(typhoons) : undefined,
    operationIndex: operationIndex?.points.at(-1)?.index,
  });
}
