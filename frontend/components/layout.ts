// 대시보드 우측 오버레이 배치 — 우측 세로 레일(툴바) 레인을 비우고, 그 왼쪽에 패널/범례를 둔다.
// 레일 폭·패널 폭이 바뀌어도 패널·범례가 함께 따라가도록 파생값을 이 한 곳에서 관리한다.
// (여러 컴포넌트에 흩어진 매직넘버 76/464/108을 여기서 유도)
export const RIGHT_RAIL_LANE = 60; // 우측 레일(아이콘 40 + 좌우 패딩) + 여백
export const RIGHT_PANEL_WIDTH = 372; // VesselPanel 폭
export const RIGHT_PANEL_RIGHT = RIGHT_RAIL_LANE + 16; // 76 — 패널을 레일 왼쪽에 붙인 위치
export const RIGHT_LEGEND_RIGHT = RIGHT_PANEL_RIGHT + RIGHT_PANEL_WIDTH + 16; // 464 — 패널 바로 왼쪽
