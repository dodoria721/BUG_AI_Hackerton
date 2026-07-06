import type { SimulationDestinationPortId } from "@/backend/ports/port-types";

export const SIMULATED_VESSEL_TYPES = ["container", "bulk", "tanker", "lng", "generalCargo"] as const;

export type SimulatedVesselType = (typeof SIMULATED_VESSEL_TYPES)[number];
export type { SimulationDestinationPortId };

export interface SimulatedShip {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sog: number;
  status: "underway";
  vesselType: SimulatedVesselType;
  grossTonnage: number;
  destinationPortId: SimulationDestinationPortId;
  source: "simulation";
  createdAt: string;
}

export type NewSimulatedShipInput = Pick<
  SimulatedShip,
  "name" | "lat" | "lng" | "sog" | "vesselType" | "grossTonnage" | "destinationPortId"
>;

export const SIMULATED_VESSEL_TYPE_LABELS: Record<SimulatedVesselType, string> = {
  container: "컨테이너선",
  bulk: "벌크선",
  tanker: "탱커",
  lng: "LNG선",
  generalCargo: "일반화물선",
};

export function isSimulatedVesselType(value: unknown): value is SimulatedVesselType {
  return typeof value === "string" && SIMULATED_VESSEL_TYPES.includes(value as SimulatedVesselType);
}
