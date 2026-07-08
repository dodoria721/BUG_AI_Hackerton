import type { ApproachRoute } from "../../ports/port-types";
import { haversineDistanceKm } from "../eta";

export interface RoutePoint {
  lat: number;
  lng: number;
}

const KM_TO_NM = 1 / 1.852;

function toLatLon(point: RoutePoint) {
  return { lat: point.lat, lon: point.lng };
}

export function calculatePolylineDistanceNm(points: RoutePoint[]): number {
  if (points.length < 2) return 0;

  return points.slice(1).reduce((totalNm, point, index) => {
    const previous = points[index];
    return totalNm + haversineDistanceKm(toLatLon(previous), toLatLon(point)) * KM_TO_NM;
  }, 0);
}

export function calculateApproachRouteDistanceNm(params: {
  origin: RoutePoint;
  route: ApproachRoute;
  fallbackDestination?: RoutePoint;
}): number {
  const points = [params.origin, ...params.route.waypoints];
  if (points.length < 2 && params.fallbackDestination) {
    return calculatePolylineDistanceNm([params.origin, params.fallbackDestination]);
  }
  return calculatePolylineDistanceNm(points);
}
