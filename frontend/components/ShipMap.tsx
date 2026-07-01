"use client";

import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Ship } from "@/backend/ports/port-types";
import { BUSAN_PORT } from "@/backend/ports/seed-port";

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

// 혼잡도(0~1)를 seed-port의 임계값에 맞춰 초록→노랑→빨강으로 매핑한다.
function congestionColor(level: number): string {
  const { low, medium } = BUSAN_PORT.congestionThresholds;
  if (level <= low) return "#4ade80"; // 원활
  if (level <= medium) return "#facc15"; // 보통
  return "#f87171"; // 혼잡
}

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

interface ShipMapProps {
  ships: Ship[];
  selectedMmsi: string | null;
  onSelect: (mmsi: string) => void;
  currentLevel: number; // 혼잡도 0~1 — 구역 오버레이 색상에 사용
}

export default function ShipMap({ ships, selectedMmsi, onSelect, currentLevel }: ShipMapProps) {
  const zoneColor = congestionColor(currentLevel);

  return (
    <MapContainer
      center={[BUSAN_PORT.center.lat, BUSAN_PORT.center.lon]}
      zoom={11}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 항만 구역: 현재 혼잡도에 따라 반투명 오버레이(초록→노랑→빨강) */}
      {BUSAN_PORT.zones.map((zone) => (
        <Circle
          key={zone.id}
          center={[zone.center.lat, zone.center.lon]}
          radius={zone.radiusKm * 1000}
          pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.12, weight: 1 }}
        >
          <Tooltip>{zone.name}</Tooltip>
        </Circle>
      ))}

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
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
