// backend/marine 의 fetch 함수·타입을 한 곳에서 재수출한다.
// seaRisk 계산(backend/prediction) 이나 어드바이저에서 개별 파일 대신 이 index 를 import해도 된다.

export * from "./types";
export { fetchMarineWeather } from "./weather";
export { fetchWaveObservation } from "./wave";
export { fetchTideObservation, fetchTidePrediction } from "./tide";
export { fetchActiveTyphoons } from "./typhoon";
export { fetchTidalCurrentForecast } from "./current";
export { fetchShipOperationIndex } from "./operationIndex";
export { fetchSeaRiskAssessment } from "./sea-risk-source";
export type { SeaRiskAssessment, SeaRiskFactor, SeaRiskGrade, SeaRiskInputs } from "../prediction/sea-risk";
