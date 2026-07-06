# 부산항 AIS AI 플랫폼

AIS(자동 선박 식별 시스템) 데이터를 기반으로 부산항의 선박 입항시간(ETA)과 항만 혼잡도를
예측하고, 지도로 시각화하며, LLM 어드바이저가 운영 권고를 제공하는 웹 플랫폼입니다.

## 기능

- **ETA 예측**: 선박의 현재 위치·속력(SOG)으로 haversine 거리 기반 결정론적 도착 시간 계산
- **혼잡도 예측**: 시간대별 입항 예정 선박 수를 집계한 통계 기반 혼잡도(0~1) 곡선
- **지도 시각화**: `react-leaflet` 기반 부산항 인근 선박 위치·상태 표시
- **LLM 어드바이저**: 현재 선박·혼잡도 상황을 바탕으로 한 운영 권고(JSON) 생성

## 스택

- Next.js (App Router) + TypeScript + TailwindCSS
- Vercel AI SDK (`generateText`) + OpenAI (`gpt-4o-mini` 기본)
- `react-leaflet`(지도) / `recharts`(차트)
- 예측 로직은 Python/ML 없이 TypeScript로 직접 구현

## 시작하기

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY 채우기 (없어도 지도/차트/목록은 동작)
npm run dev
```

`http://localhost:3000` → 랜딩, `/dashboard` → 지도+차트+목록+어드바이저.

키 없이도 `api/ships`, `api/congestion`은 목업 데이터로 끝까지 동작합니다.
`api/advisor`는 `OPENAI_API_KEY`가 있어야 실제 LLM 응답을 받습니다.

## Energy Decision / JIT 감속 권고 확인

`/api/energy-decisions`는 AIS 선박 ETA가 `/api/congestion`의 forecast 시간대에 포함될 때 ETA bucket 기준으로 JIT 감속 권고를 계산합니다. Port-MIS congestion forecast가 오래되어 선박 ETA 범위를 포함하지 않으면 `currentLevel` fallback으로 계산하며, 이 경우 `/api/energy-decisions` 응답의 `forecastFreshness`, `summary.currentLevelFallbackCount`, `emptyReason`에서 이유를 확인할 수 있습니다.

Port-MIS 데이터를 최신화한 뒤 다시 확인하려면:

```bash
npm run enrich:portmis
```

확인 URL:

```txt
http://localhost:3000/api/congestion
http://localhost:3000/api/energy-decisions
http://localhost:3000/dashboard
```

현재 또는 ETA 시간대 혼잡도가 낮으면 권고가 0건일 수 있습니다. 이 경우 대시보드의 감속 권고 카드가 후보 선박 수, ETA forecast 매칭 수, currentLevel fallback 사용 수, 낮은 혼잡 제외 수를 표시합니다.

## 폴더 구조

- `app/` — 페이지(App Router)와 API 라우트
- `frontend/components/` — UI 컴포넌트 (지도, 차트, 목록, 어드바이저 패널)
- `backend/` — 로직·프롬프트·파싱·설정 데이터
  - `backend/ports/seed-port.ts` — 부산항 좌표·선석·구역·임계값 (★ 다른 항만 적용 시 이 파일만 교체)
  - `backend/ais/` — AIS 목업 데이터 생성
  - `backend/prediction/` — ETA·혼잡도 계산
  - `backend/advisor/` — LLM 프롬프트·응답 파싱

자세한 설계 원칙은 [CLAUDE.md](CLAUDE.md) 참고.
