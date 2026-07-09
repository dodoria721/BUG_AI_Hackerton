// AIS 선종코드(ITU-R M.1371 "Type of ship and cargo", 0~99) → 관제 분류.
//
// 관제 관점에서 "대형 상선(commercial)"을 양성 확인하는 것을 최우선으로 한다.
// 소형·작업선(small)은 개별 충돌 경보 대상이 아니고, 나머지 애매한 코드는 other로 둔다.
//   40~49 고속선(HSC, 주로 여객), 60~69 여객, 70~79 화물, 80~89 탱커 → commercial
//   30~37 어선·예인·준설·잠수·군·범선·유람, 50~59 도선·SAR·예선·항만작업 등 → small
//   그 외(0~29 미정의/WIG, 90~99 기타) → other

export type AisTypeClass = "commercial" | "small" | "other";

export function aisShipTypeClass(code?: number | null): AisTypeClass {
  if (code == null || code <= 0 || code > 99) return "other";
  if ((code >= 40 && code <= 49) || (code >= 60 && code <= 89)) return "commercial";
  if ((code >= 30 && code <= 37) || (code >= 50 && code <= 59)) return "small";
  return "other";
}
