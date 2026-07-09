"use client";

import { Fragment, type ReactNode, useEffect, useRef } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { BUSAN_DISPLAY_PORT, SIMULATION_DESTINATION_PORTS } from "@/frontend/config/ports";
import type { RouteScenarioMapOverlay, RoutePolylinePoint } from "@/frontend/types/route-scenario";
import type { SimulatedShip } from "@/frontend/types/simulation";
import { SIMULATED_VESSEL_TYPE_LABELS } from "@/frontend/types/simulation";
import { BASEMAPS } from "./basemaps";

interface SimulationMapProps {
  ships: SimulatedShip[];
  simulationMode: boolean;
  onMapContextMenu: (position: { lat: number; lng: number }) => void;
  routeOverlays?: RouteScenarioMapOverlay[];
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

function simulatedShipIcon(label: "SIM" | "SNAP"): L.DivIcon {
  const snapshot = label === "SNAP";
  const html = `
    <div style="
      width:34px;height:34px;border-radius:10px;
      background:${snapshot ? "#60a5fa" : "#facc15"};color:${snapshot ? "#082f49" : "#111827"};
      border:2px solid #0b1220;
      display:flex;align-items:center;justify-content:center;
      font-weight:900;font-size:10px;letter-spacing:.04em;
      box-shadow:0 10px 24px rgba(0,0,0,.36);
    ">${label}</div>`;
  return L.divIcon({
    html,
    className: "simulation-ship-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function destinationIcon(shortName: string): L.DivIcon {
  const html = `
    <div style="
      min-width:42px;height:28px;border-radius:8px;
      background:#38bdf8;color:#082f49;
      border:2px solid #0b1220;
      display:flex;align-items:center;justify-content:center;
      font-weight:900;font-size:10px;letter-spacing:.03em;
      box-shadow:0 10px 24px rgba(0,0,0,.28);
      padding:0 7px;
      white-space:nowrap;
    ">PORT ${shortName}</div>`;
  return L.divIcon({
    html,
    className: "simulation-port-marker",
    iconSize: [58, 28],
    iconAnchor: [29, 14],
  });
}

const simIcon = simulatedShipIcon("SIM");
const snapshotIcon = simulatedShipIcon("SNAP");
// 대시보드와 동일한 밝은 배경(CARTO light) — 라이트 테마 시안에 맞춘다. 경로 폴리라인 디자인은 그대로 둔다.
const basemap = BASEMAPS.find((item) => item.id === "light" && item.url) ?? BASEMAPS.find((item) => item.url) ?? BASEMAPS[0];

function validOverlay(overlay: RouteScenarioMapOverlay): boolean {
  return (
    overlay.points.length >= 2 &&
    overlay.points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  );
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function FlowingRoutePolyline({
  children,
  color,
  isRecommended,
  positions,
}: {
  children: ReactNode;
  color: string;
  isRecommended: boolean;
  positions: [number, number][];
}) {
  const lineRef = useRef<L.Polyline>(null);

  useEffect(() => {
    if (!isRecommended) return;

    let frame = 0;
    let start = 0;
    const dashCycle = 56;
    const durationMs = 2200;

    function tick(now: number) {
      if (start === 0) start = now;
      const offset = -(((now - start) / durationMs) * dashCycle) % dashCycle;
      const element = lineRef.current?.getElement();
      if (element) {
        element.setAttribute("stroke-dashoffset", String(offset));
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isRecommended]);

  return (
    <Polyline
      ref={lineRef}
      positions={positions}
      pathOptions={{
        color,
        weight: isRecommended ? 5 : 2.5,
        opacity: isRecommended ? 0.96 : 0.46,
        dashArray: isRecommended ? "12 16" : "4 9",
        lineCap: "round",
        lineJoin: "round",
        className: isRecommended
          ? "sim-route-line sim-route-line-recommended"
          : "sim-route-line sim-route-line-alternative",
      }}
    >
      {children}
    </Polyline>
  );
}

function waypointKind(index: number, points: RoutePolylinePoint[]): "start" | "middle" | "end" {
  if (index === 0) return "start";
  if (index === points.length - 1) return "end";
  return "middle";
}

function waypointStyle(kind: "start" | "middle" | "end"): L.PathOptions {
  if (kind === "start") {
    return { color: "#fef08a", weight: 2, fillColor: "#facc15", fillOpacity: 0.95, className: "sim-route-waypoint sim-route-waypoint-start" };
  }
  if (kind === "end") {
    return { color: "#ccfbf1", weight: 2, fillColor: "#2dd4bf", fillOpacity: 0.95, className: "sim-route-waypoint sim-route-waypoint-end" };
  }
  return { color: "#99f6e4", weight: 1.5, fillColor: "#22d3ee", fillOpacity: 0.88, className: "sim-route-waypoint" };
}

export default function SimulationMap({ ships, simulationMode, onMapContextMenu, routeOverlays = [] }: SimulationMapProps) {
  const overlays = routeOverlays.filter(validOverlay);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", cursor: simulationMode ? "crosshair" : "default" }}>
      <MapContainer center={[BUSAN_DISPLAY_PORT.center.lat, BUSAN_DISPLAY_PORT.center.lng]} zoom={11} zoomControl={false} className="h-full w-full">
        {basemap.url && <TileLayer attribution={basemap.attribution} url={basemap.url} />}
        <SimulationContextMenuHandler enabled={simulationMode} onMapContextMenu={onMapContextMenu} />
        {overlays.map((overlay) => {
          const positions = overlay.points.map((point) => [point.lat, point.lng] as [number, number]);
          const isAiRoute = overlay.routeSource === "ai-computed-route";
          // AI 계산 경로는 지정항로(청록/파랑)와 구분되도록 보라색 계열을 쓴다.
          const color = isAiRoute ? (overlay.isRecommended ? "#c084fc" : "#a78bfa") : overlay.isRecommended ? "#5eead4" : "#60a5fa";
          return (
            <Fragment key={`${overlay.shipId}-${overlay.routeId}`}>
              {overlay.isRecommended && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: isAiRoute ? "#a855f7" : "#2dd4bf",
                    weight: 13,
                    opacity: 0.16,
                    lineCap: "round",
                    lineJoin: "round",
                    className: "sim-route-line sim-route-line-halo",
                  }}
                  interactive={false}
                />
              )}
              <FlowingRoutePolyline color={color} isRecommended={overlay.isRecommended} positions={positions}>
                <Tooltip sticky>
                  <span style={{ fontWeight: 900 }}>
                    {isAiRoute ? "AI 계산 경로" : overlay.isRecommended ? "추천 시뮬레이션 경로" : "후보 경로"}
                  </span>{" "}
                  · {overlay.routeName}
                </Tooltip>
                <Popup>
                  <div className="text-sm">
                    <p
                      style={{
                        margin: "0 0 6px",
                        fontWeight: 900,
                        color: isAiRoute ? "#7e22ce" : overlay.isRecommended ? "#0f766e" : "#2563eb",
                        letterSpacing: ".04em",
                      }}
                    >
                      {isAiRoute ? "AI-COMPUTED ROUTE (NOT AN MOF-DESIGNATED ROUTE)" : overlay.isRecommended ? "RECOMMENDED SCENARIO ROUTE" : "SCENARIO ROUTE CANDIDATE"}
                    </p>
                    <p style={{ margin: "3px 0", fontWeight: 800 }}>{overlay.routeName}</p>
                    <p style={{ margin: "3px 0" }}>거리: {overlay.distanceNm ?? "-"}NM</p>
                    <p style={{ margin: "3px 0" }}>ETA: {formatDateTime(overlay.eta)}</p>
                    <p style={{ margin: "3px 0" }}>점수: {overlay.score ?? "-"}</p>
                    <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
                      {isAiRoute
                        ? "해수부 지정항로가 아닌, 육지·활성 태풍 위험구역을 피해 계산한 참고용 경로입니다. 실제 항해 지시가 아닙니다."
                        : "해수부 항만가이드라인 지정항로 중심선을 표시한 시뮬레이션 선입니다. 실제 항해 지시가 아닙니다."}
                    </p>
                  </div>
                </Popup>
              </FlowingRoutePolyline>
              {overlay.isRecommended && (
                <>
                  {overlay.points.map((point, index) => {
                    const kind = waypointKind(index, overlay.points);
                    return (
                      <CircleMarker
                        key={`${overlay.shipId}-${overlay.routeId}-${index}`}
                        center={[point.lat, point.lng]}
                        radius={kind === "middle" ? 4 : 6}
                        pathOptions={waypointStyle(kind)}
                      >
                        <Tooltip direction="top">
                          {kind === "start" ? "SHIP" : kind === "end" ? "PORT" : "WAYPOINT"} · {point.label ?? "시뮬레이션 경로 지점"}
                        </Tooltip>
                        <Popup>
                          <div className="text-sm">
                            <p style={{ margin: "0 0 6px", fontWeight: 900, color: "#0f766e", letterSpacing: ".04em" }}>SIMULATION ROUTE POINT</p>
                            <p style={{ margin: "3px 0", fontWeight: 800 }}>{point.label ?? "접근 경로 지점"}</p>
                            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>시뮬레이션용 접근 경로 지점입니다.</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </>
              )}
            </Fragment>
          );
        })}
        {SIMULATION_DESTINATION_PORTS.map((destination) => (
          <Marker
            key={destination.id}
            position={[destination.center.lat, destination.center.lng]}
            icon={destinationIcon(destination.shortName)}
          >
            <Tooltip direction="top" offset={[0, -16]}>
              <span style={{ fontWeight: 800 }}>PORT</span> · {destination.name}
            </Tooltip>
            <Popup>
              <div className="text-sm">
                <p style={{ margin: "0 0 6px", fontWeight: 900, color: "#0369a1", letterSpacing: ".06em" }}>SIMULATION PORT</p>
                <p style={{ margin: "3px 0", fontWeight: 800 }}>{destination.name}</p>
                <p style={{ margin: "3px 0" }}>혼잡도 기준 지역: {destination.congestionRegionId}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {ships.map((ship) => (
          (() => {
            const destination = SIMULATION_DESTINATION_PORTS.find((item) => item.id === ship.destinationPortId) ?? SIMULATION_DESTINATION_PORTS[0];
            const isSnapshot = ship.source === "ais-snapshot";
            const sourceLabel = isSnapshot ? "LIVE SNAPSHOT" : "SIM";
            return (
          <Marker key={ship.id} position={[ship.lat, ship.lng]} icon={isSnapshot ? snapshotIcon : simIcon}>
            <Tooltip direction="top" offset={[0, -16]}>
              <span style={{ fontWeight: 800 }}>{sourceLabel}</span> · {ship.name} · {destination?.shortName ?? "북항"} · {ship.sog}kn
            </Tooltip>
            <Popup>
              <div className="text-sm">
                <p style={{ margin: "0 0 6px", fontWeight: 900, color: isSnapshot ? "#2563eb" : "#ca8a04", letterSpacing: ".06em" }}>{sourceLabel}</p>
                <p style={{ margin: "3px 0", fontWeight: 800 }}>{ship.name}</p>
                <p style={{ margin: "3px 0" }}>도착지: {destination?.name ?? "부산항 북항"}</p>
                <p style={{ margin: "3px 0" }}>속도: {ship.sog}kn</p>
                <p style={{ margin: "3px 0" }}>선종: {ship.vesselType ? SIMULATED_VESSEL_TYPE_LABELS[ship.vesselType] : "-"}</p>
                <p style={{ margin: "3px 0" }}>GT: {ship.grossTonnage?.toLocaleString() ?? "-"}</p>
                {ship.mmsi || ship.imo ? <p style={{ margin: "3px 0" }}>MMSI/IMO: {ship.mmsi ?? "-"} / {ship.imo ?? "-"}</p> : null}
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
                  {isSnapshot ? "실제 선박의 현재 위치를 복사한 시뮬레이션 항목입니다." : "사용자가 생성한 가상 선박입니다."}
                </p>
              </div>
            </Popup>
          </Marker>
            );
          })()
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
      <div
        style={{
          position: "absolute",
          right: 14,
          bottom: 40,
          zIndex: 500,
          width: 230,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(120,160,255,.2)",
          background: "linear-gradient(160deg,rgba(8,17,34,.9),rgba(13,31,74,.82))",
          color: "#cbd5e1",
          fontSize: 11,
          lineHeight: 1.45,
          boxShadow: "0 14px 38px rgba(0,0,0,.32)",
          pointerEvents: "none",
        }}
      >
        <div style={{ color: "#5eead4", fontWeight: 900, letterSpacing: ".06em", marginBottom: 7 }}>ROUTE LEGEND</div>
        <div style={{ display: "grid", gap: 5 }}>
          <span><b style={{ color: "#5eead4" }}>━━</b> 추천 경로</span>
          <span><b style={{ color: "#60a5fa" }}>┄┄</b> 후보 경로</span>
          <span><b style={{ color: "#facc15" }}>SIM</b> 시뮬레이션 선박</span>
          <span><b style={{ color: "#38bdf8" }}>PORT</b> 도착 항만</span>
        </div>
        <div style={{ marginTop: 7, color: "#fde68a" }}>경로는 시뮬레이션용 단순화 접근 경로입니다.</div>
      </div>
    </div>
  );
}
