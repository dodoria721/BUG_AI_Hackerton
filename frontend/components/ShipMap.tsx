"use client";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  BUSAN_DISPLAY_PORT,
  SIMULATION_DESTINATION_PORTS,
  congestionDisplayColor,
  congestionDisplayLabel,
} from "@/frontend/config/ports";
import type { RegionCongestionSeries, Ship } from "@/frontend/types/domain";
import { BASEMAPS } from "./basemaps";

// 지역 혼잡도 id(busan/gamcheon/sinhang) → 지도 표시 좌표. 좌표는 config에만 두고 여기서 조회만 한다.
const REGION_CENTER = new Map<string, { lat: number; lng: number }>(
  SIMULATION_DESTINATION_PORTS.map((p) => [p.congestionRegionId, p.center])
);

const STATUS_COLOR: Record<Ship["status"], string> = {
  underway: "#38bdf8",
  anchored: "#facc15",
  moored: "#4ade80",
};

const STATUS_LABEL: Record<Ship["status"], string> = {
  underway: "항해 중",
  anchored: "묘박 중",
  moored: "접안 중",
};

// cog(침로)에 따라 회전하는 삼각형(화살촉) 아이콘을 divIcon으로 만든다.
// 기본 Marker 이미지 대신 인라인 SVG를 쓰면 Next.js 번들러의 아이콘 경로 문제를 피할 수 있다.
function shipIcon(ship: Ship, selected: boolean): L.DivIcon {
  const color = STATUS_COLOR[ship.status];
  const size = selected ? 30 : 22;
  const html = `
    <div style="transform: rotate(${ship.cog}deg); width:${size}px; height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <polygon points="12,2 20,22 12,17 4,22"
          fill="${color}" stroke="#0b1220" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: "ship-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// 지역별(북항/감천/신항) AIS 통계 혼잡도 버블(divIcon). 혼잡도가 높을수록 크고 붉게,
// 버블 숫자는 해수부 연안AIS 통계의 해역 척수(currentVessels), 아래 라벨은 혼잡도 %.
function regionCongestionIcon(name: string, level: number, vessels: number): L.DivIcon {
  const size = Math.min(60, 34 + level * 30);
  const color = congestionDisplayColor(level);
  const pct = Math.round(level * 100);
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-2px)">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#0b1220;
        display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.max(12, size / 3.4)}px;
        border:2px solid #fff;box-shadow:0 4px 12px rgba(20,40,90,.35)">${vessels}</div>
      <div style="margin-top:2px;font-size:10.5px;font-weight:700;color:#0a1830;background:rgba(255,255,255,.85);
        padding:1px 6px;border-radius:6px;white-space:nowrap">${name} ${pct}%</div>
    </div>`;
  return L.divIcon({ html, className: "region-congestion-marker", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

interface ShipMapProps {
  ships: Ship[];
  selectedMmsi: string | null;
  onSelect: (mmsi: string) => void;
  regions?: RegionCongestionSeries[]; // 지역별 AIS 통계 혼잡도 — 지역 중심에 버블로 표시
  basemapId: string; // 배경 지도 선택값(대시보드 우측 레일에서 제어)
}

export default function ShipMap({ ships, selectedMmsi, onSelect, regions = [], basemapId }: ShipMapProps) {
  const basemap = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0];

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[BUSAN_DISPLAY_PORT.center.lat, BUSAN_DISPLAY_PORT.center.lng]}
        zoom={11}
        zoomControl={false}
        className="h-full w-full"
      >
        {/* key로 배경 전환 시 타일 레이어를 확실히 교체한다 */}
        {basemap.url && <TileLayer key={basemap.id} attribution={basemap.attribution} url={basemap.url} />}
        {/* 위성 배경일 때 지명·도로 라벨 오버레이 */}
        {basemap.hybrid && <TileLayer key={`${basemap.id}-hybrid`} url={basemap.hybrid} />}

      {/* 지역별 AIS 통계 혼잡도 버블 (해수부 연안AIS 통계 기반) */}
      {regions.map((r) => {
        const center = REGION_CENTER.get(r.id);
        if (!center) return null;
        return (
          <Marker key={r.id} position={[center.lat, center.lng]} icon={regionCongestionIcon(r.name, r.currentLevel, r.currentVessels)}>
            <Popup>
              <div className="text-sm">
                <p className="font-medium">{r.name}</p>
                <p>혼잡도: {Math.round(r.currentLevel * 100)}% ({congestionDisplayLabel(r.currentLevel)})</p>
                <p>해역 척수(AIS): {r.currentVessels}척</p>
                <p>최근 {r.activityWindowHours}h · 입항 {r.arrivals} · 출항 {r.departures}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {ships.map((ship) => (
        <Marker
          key={ship.mmsi}
          position={[ship.lat, ship.lon]}
          icon={shipIcon(ship, ship.mmsi === selectedMmsi)}
          eventHandlers={{ click: () => onSelect(ship.mmsi) }}
        >
          {/* hover: 선박명·속도 */}
          <Tooltip direction="top" offset={[0, -12]}>
            <span className="font-medium">{ship.name}</span> · {ship.sog}kn
          </Tooltip>

          {/* click: 상세(ETA 포함) */}
          <Popup>
            <div className="text-sm">
              <p className="font-medium">{ship.name}</p>
              <p>MMSI: {ship.mmsi}</p>
              <p>상태: {STATUS_LABEL[ship.status]}</p>
              <p>속력: {ship.sog}kn</p>
              <p>침로: {ship.cog}°</p>
              <p>ETA: {new Date(ship.eta).toLocaleString("ko-KR")}</p>
              {/* Port-MIS 입출항 신고 매칭 결과(있을 때만) — backend/portmis/run-enrich.ts */}
              {(ship.previousPort || ship.nextPort || ship.berthName) && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #e5e7eb" }}>
                  {ship.previousPort && <p>직전 출항항: {ship.previousPort}</p>}
                  {ship.nextPort && <p>다음 기항지: {ship.nextPort}</p>}
                  {ship.berthName && <p>선석: {ship.berthName}</p>}
                  {ship.grossTonnage != null && <p>총톤수: {ship.grossTonnage.toLocaleString()}톤</p>}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
      </MapContainer>
    </div>
  );
}
