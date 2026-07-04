# backend/prediction

ML/Python 없이 순수 TypeScript로 계산하는 예측 로직. 둘 다 입력→출력만 있는 순수 함수다.

- `eta.ts` — haversine 거리를 SOG(속력)로 나눠 ETA를 계산한다(`computeEta`). 목적지가
  없으면 도착 시각도 없다 — 결정론적 계산이며 학습된 모델을 쓰지 않는다.
- `congestion.ts` — AIS 폴백에서는 `status === "underway"`인 선박들의 ETA를 시간 단위로 묶어,
  `PortConfig.shipsPerHourCapacity` 대비 비율로 혼잡도(0~1)를 낸다. Port-MIS 주 소스에서는
  시간대별 입항 신고 밀도와 현재 정박 선박 수(`port_calls`)를 함께 반영한다.

두 파일 모두 `backend/ports/seed-port.ts`의 값(좌표, capacity)만 참조하고, 항만 고유 값을
직접 갖지 않는다.
