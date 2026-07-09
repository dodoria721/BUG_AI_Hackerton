// 공공데이터포털 "해양수산부 국립해양조사원_선박운항지수 조회" 클라이언트 — 5단계 "추가하면 좋은 것" 항목.
// 서비스 키가 없으면 null 을 반환해 호출부에서 안전하게 처리한다.
//
// 환경변수(.env.local):
//   KHOA_API_KEY — 공공데이터포털 일반 인증키(Decoding)
//   (wave.ts · tide.ts · current.ts 와 공용 — 같은 기관 발급 키)
//
// 요청 주소(제공받은 엔드포인트):
//   https://apis.data.go.kr/1192136/shipIndex
//
// TODO(API 연동): 정확한 요청 파라미터명(구역/지점 코드 등)·응답 JSON의 필드명(지수·등급 컬럼명)은
// 문서 기준으로 확인 후 채워야 한다. 좌표·구역 ID가 필요하면 backend/ports/seed-port.ts 의
// congestionRegions 를 재사용한다(새 구역 상수를 이 파일에 만들지 않는다).

import type { ShipOperationIndex } from "./types";

const ENDPOINT = "https://apis.data.go.kr/1192136/shipIndex";

/**
 * 부산항 인근 해역의 선박운항지수 시계열을 조회한다.
 * 키 미설정 시 null, API 오류 시 예외를 던진다.
 */
export async function fetchShipOperationIndex(): Promise<ShipOperationIndex | null> {
  const key = process.env.KHOA_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({ serviceKey: key, resultType: "json" });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
  const text = await res.text();

  // TODO(API 연동): 실제 응답 구조를 확인해 ShipOperationIndex 로 매핑한다.
  throw new Error(
    `fetchShipOperationIndex 미구현: 응답 파싱 로직을 문서 기준으로 채워야 한다. raw=${text.slice(0, 200)}`
  );
}
