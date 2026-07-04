// 지도 배경 타일 프리셋 — leaflet에 의존하지 않는 순수 데이터/설정.
// ShipMap(타일 렌더)과 대시보드(우측 레일 UI)가 함께 import 한다.
// 타일은 브라우저가 직접 받으므로 키가 든 URL도 NEXT_PUBLIC_ 으로 노출된다(타일 서비스의 정상 동작).
//   NEXT_PUBLIC_VWORLD_KEY   — vworld.kr 발급 키 (있으면 기본/위성이 국토부 VWorld로 승격)
//   NEXT_PUBLIC_VWORLD_LAYER — 초기 선택 배경 (base | light | dark | satellite | enc)
//   NEXT_PUBLIC_ENC_TILE_URL — 국립해양조사원 ENC(전자해도) 타일 URL 템플릿 (있으면 ENC 활성화)
const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;
const ENC_TILE_URL = process.env.NEXT_PUBLIC_ENC_TILE_URL;

export interface Basemap {
  id: string;
  label: string;
  icon: string; // 드롭다운 행에 붙는 글리프
  url: string | null; // null이면 아직 설정이 필요한(비활성) 항목
  attribution: string;
  hybrid?: string; // 위성 배경 위에 지명·도로 라벨을 겹칠 오버레이 타일
  note?: string; // 비활성일 때 안내 문구
  separator?: boolean; // 드롭다운에서 위쪽에 구분선을 그어 그룹을 나눌 항목
}

const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// 레퍼런스와 같은 큐레이션 목록: 기본 / 라이트 / 다크 / 위성 / ENC 전자해도.
// VWorld 키가 있으면 기본·위성은 국토부 타일로 승격(한국 연안 품질↑, 위성엔 라벨 오버레이).
function buildBasemaps(): Basemap[] {
  const vworld = (layer: string, ext = "png") => `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${layer}/{z}/{y}/{x}.${ext}`;

  return [
    {
      id: "base",
      label: "기본",
      icon: "🗺️",
      url: VWORLD_KEY ? vworld("Base") : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: VWORLD_KEY
        ? '&copy; <a href="https://www.vworld.kr">VWorld</a> · 국토교통부'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    {
      id: "light",
      label: "라이트",
      icon: "☀️",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: CARTO_ATTR,
    },
    {
      id: "dark",
      label: "다크",
      icon: "🌙",
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: CARTO_ATTR,
    },
    {
      id: "satellite",
      label: "위성",
      icon: "🛰️",
      url: VWORLD_KEY
        ? vworld("Satellite", "jpeg")
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: VWORLD_KEY ? '&copy; <a href="https://www.vworld.kr">VWorld</a> · 국토교통부' : "Tiles &copy; Esri",
      hybrid: VWORLD_KEY ? vworld("Hybrid") : undefined,
    },
    {
      id: "enc",
      label: "ENC 전자해도",
      icon: "⚓",
      // 국립해양조사원 ENC는 키·도메인 등록이 필요한 서비스라 URL을 env로 주입한다.
      url: ENC_TILE_URL || null,
      attribution: '&copy; <a href="https://www.khoa.go.kr">국립해양조사원</a>',
      note: "NEXT_PUBLIC_ENC_TILE_URL 설정 필요",
      separator: true, // 일반 배경들과 시각적으로 구분
    },
  ];
}

export const BASEMAPS = buildBasemaps();
export const BASEMAP_STORAGE = "portiq.basemap";

// 초기 선택 배경 결정: (1) localStorage 저장값, (2) env의 초기 레이어 지정, (3) 첫 항목.
export function initialBasemapId(): string {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(BASEMAP_STORAGE);
    if (saved && BASEMAPS.some((b) => b.id === saved && b.url)) return saved;
  }
  const envLayer = process.env.NEXT_PUBLIC_VWORLD_LAYER?.toLowerCase();
  if (envLayer && BASEMAPS.some((b) => b.id === envLayer && b.url)) return envLayer;
  return BASEMAPS.find((b) => b.url)?.id ?? BASEMAPS[0].id;
}
