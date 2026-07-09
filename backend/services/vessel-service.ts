import { fetchShips } from "@/backend/ais/ship-source";
import { resolveCongestion } from "@/backend/congestion/resolve-congestion";
import {
  findVesselSpecByImo,
  findVesselSpecByMmsi,
  findVesselSpecByName,
} from "@/backend/data/energy/vessel-specs";
import { haversineDistanceKm } from "@/backend/prediction/eta";
import { recommendSpeed } from "@/backend/prediction/speed-advisory";
import { computeApproachCiiCurve, computeCiiStatus } from "@/backend/prediction/cii";
import { fetchPortCalls } from "@/backend/portmis/portcall-source";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import { buildVesselView, monitorCandidates, type VesselCandidate, type VesselView } from "@/backend/vessel/build-view";

function buildAdvisory(view: VesselView, level: number) {
  if (view.status !== "underway" || !view.position || view.speedKn == null || view.speedKn < 1) return null;

  const distanceNm = haversineDistanceKm(view.position, BUSAN_PORT.center) / 1.852;
  if (distanceNm < 5 || distanceNm > 800) return null;

  const currentInPort = level * BUSAN_PORT.portCallCapacity.portWide.p99;
  return recommendSpeed(
    {
      vesselType: view.type ?? undefined,
      grossTonnage: view.grossTonnage ?? undefined,
      distanceNm,
      currentSpeedKn: view.speedKn,
      currentInPort,
    },
    BUSAN_PORT
  );
}

function distanceToBusanNm(view: VesselView): number | null {
  if (!view.position) return null;
  return haversineDistanceKm(view.position, BUSAN_PORT.center) / 1.852;
}

function findSpec(candidate: VesselCandidate, view: VesselView) {
  return (
    findVesselSpecByMmsi(candidate.ship?.mmsi ?? view.mmsi ?? undefined) ??
    findVesselSpecByImo(candidate.ship?.imo ?? view.imo ?? undefined) ??
    findVesselSpecByName(candidate.call.vesselName) ??
    findVesselSpecByName(view.name)
  );
}

export async function getVesselMonitorData(now: Date = new Date()) {
  const [ships, portCalls, congestion] = await Promise.all([
    fetchShips(),
    fetchPortCalls(),
    resolveCongestion(now),
  ]);
  const level = congestion.currentLevel ?? 0;

  const items = monitorCandidates(ships, portCalls)
    .slice(0, 40)
    .map((candidate, index) => {
      const view = buildVesselView(candidate, now);
      if (!view) return null;
      const spec = findSpec(candidate, view);
      const distanceNm = distanceToBusanNm(view);
      return {
        id: `${view.callSign ?? view.name}-${index}`,
        label: candidate.call.vesselName,
        hasMatchedShip: Boolean(candidate.ship),
        view,
        cii: computeCiiStatus(view.type ?? undefined, view.grossTonnage ?? undefined, now.getFullYear()),
        approachCiiCurve: computeApproachCiiCurve({
          vesselType: view.type ?? spec?.vesselType,
          grossTonnage: view.grossTonnage ?? spec?.grossTonnage,
          deadweightTonnage: spec?.deadweightTonnage,
          distanceNm,
          currentSpeedKn: view.speedKn,
        }),
        advisory: buildAdvisory(view, level),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    source: "vessel-monitor",
    lastUpdated: now.toISOString(),
    port: BUSAN_PORT.name,
    congestion: {
      currentLevel: level,
      source: congestion.source,
      basis: congestion.basis,
      lastUpdated: congestion.lastUpdated,
    },
    items,
  };
}
