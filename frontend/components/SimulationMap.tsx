"use client";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import type { SimulatedShip } from "@/frontend/types/simulation";
import { SIMULATED_VESSEL_TYPE_LABELS } from "@/frontend/types/simulation";
import { BASEMAPS } from "./basemaps";

interface SimulationMapProps {
  ships: SimulatedShip[];
  simulationMode: boolean;
  onMapContextMenu: (position: { lat: number; lng: number }) => void;
}

function SimulationContextMenuHandler({
  enabled,
  onMapContextMenu,
}: {
  enabled: boolean;
  onMapContextMenu: SimulationMapProps["onMapContextMenu"];
}) {
  useMapEvents({
    contextmenu(event) {
      event.originalEvent.preventDefault();
      if (!enabled) return;
      onMapContextMenu({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function simulatedShipIcon(): L.DivIcon {
  const html = `
    <div style="
      width:34px;height:34px;border-radius:10px;
      background:#facc15;color:#111827;
      border:2px solid #0b1220;
      display:flex;align-items:center;justify-content:center;
      font-weight:900;font-size:10px;letter-spacing:.04em;
      box-shadow:0 10px 24px rgba(0,0,0,.36);
    ">SIM</div>`;
  return L.divIcon({
    html,
    className: "simulation-ship-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const simIcon = simulatedShipIcon();
const basemap = BASEMAPS.find((item) => item.id === "dark" && item.url) ?? BASEMAPS.find((item) => item.url) ?? BASEMAPS[0];

export default function SimulationMap({ ships, simulationMode, onMapContextMenu }: SimulationMapProps) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", cursor: simulationMode ? "crosshair" : "default" }}>
      <MapContainer center={[BUSAN_PORT.center.lat, BUSAN_PORT.center.lon]} zoom={11} zoomControl={false} className="h-full w-full">
        {basemap.url && <TileLayer attribution={basemap.attribution} url={basemap.url} />}
        <SimulationContextMenuHandler enabled={simulationMode} onMapContextMenu={onMapContextMenu} />
        {ships.map((ship) => (
          <Marker key={ship.id} position={[ship.lat, ship.lng]} icon={simIcon}>
            <Tooltip direction="top" offset={[0, -16]}>
              <span style={{ fontWeight: 800 }}>SIM</span> · {ship.name} · {ship.sog}kn
            </Tooltip>
            <Popup>
              <div className="text-sm">
                <p style={{ margin: "0 0 6px", fontWeight: 900, color: "#ca8a04", letterSpacing: ".06em" }}>SIMULATION</p>
                <p style={{ margin: "3px 0", fontWeight: 800 }}>{ship.name}</p>
                <p style={{ margin: "3px 0" }}>속도: {ship.sog}kn</p>
                <p style={{ margin: "3px 0" }}>선종: {SIMULATED_VESSEL_TYPE_LABELS[ship.vesselType]}</p>
                <p style={{ margin: "3px 0" }}>GT: {ship.grossTonnage.toLocaleString()}</p>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
                  실제 AIS/Port-MIS 선박이 아닌 가상 선박입니다.
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: 14,
          zIndex: 500,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(250,204,21,.32)",
          background: "rgba(17,24,39,.86)",
          color: "#fde68a",
          fontSize: 11,
          fontWeight: 800,
          pointerEvents: "none",
        }}
      >
        SIM 지도 · {simulationMode ? "우클릭으로 가상 선박 생성" : "생성 모드 꺼짐"}
      </div>
    </div>
  );
}
