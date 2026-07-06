"use client";

import { useCallback, useEffect, useState } from "react";
import { BUSAN_PORT } from "@/backend/ports/seed-port";
import type { NewSimulatedShipInput, SimulatedShip } from "@/frontend/types/simulation";
import { isSimulatedVesselType } from "@/frontend/types/simulation";

export const SIMULATED_SHIPS_STORAGE_KEY = "bug-ai-hackathon:simulated-ships";

function createSimulationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sim-${crypto.randomUUID()}`;
  }
  return `sim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function defaultDestinationPortId(): SimulatedShip["destinationPortId"] {
  return BUSAN_PORT.simulationDestinations[0]?.id ?? "busan-north";
}

function normalizeDestinationPortId(value: unknown): SimulatedShip["destinationPortId"] {
  return BUSAN_PORT.simulationDestinations.some((destination) => destination.id === value)
    ? (value as SimulatedShip["destinationPortId"])
    : defaultDestinationPortId();
}

function normalizeSimulatedShip(value: unknown): SimulatedShip | null {
  if (!value || typeof value !== "object") return null;
  const ship = value as Record<string, unknown>;
  if (
    typeof ship.id !== "string" ||
    typeof ship.name !== "string" ||
    !isFiniteNumber(ship.lat) ||
    !isFiniteNumber(ship.lng) ||
    !isFiniteNumber(ship.sog) ||
    ship.status !== "underway" ||
    !isSimulatedVesselType(ship.vesselType) ||
    !isFiniteNumber(ship.grossTonnage) ||
    ship.source !== "simulation" ||
    typeof ship.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: ship.id,
    name: ship.name,
    lat: ship.lat,
    lng: ship.lng,
    sog: ship.sog,
    status: "underway",
    vesselType: ship.vesselType,
    grossTonnage: ship.grossTonnage,
    destinationPortId: normalizeDestinationPortId(ship.destinationPortId),
    source: "simulation",
    createdAt: ship.createdAt,
  };
}

function parseStoredShips(raw: string | null): SimulatedShip[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSimulatedShip).filter((ship): ship is SimulatedShip => Boolean(ship));
  } catch {
    return [];
  }
}

export function useSimulatedShips() {
  const [simulatedShips, setSimulatedShips] = useState<SimulatedShip[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSimulatedShips(parseStoredShips(window.localStorage.getItem(SIMULATED_SHIPS_STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(SIMULATED_SHIPS_STORAGE_KEY, JSON.stringify(simulatedShips));
  }, [hydrated, simulatedShips]);

  const addSimulatedShip = useCallback((input: NewSimulatedShipInput) => {
    const ship: SimulatedShip = {
      ...input,
      id: createSimulationId(),
      status: "underway",
      source: "simulation",
      createdAt: new Date().toISOString(),
    };
    setSimulatedShips((prev) => [...prev, ship]);
    return ship;
  }, []);

  const removeSimulatedShip = useCallback((id: string) => {
    setSimulatedShips((prev) => prev.filter((ship) => ship.id !== id));
  }, []);

  const clearSimulatedShips = useCallback(() => {
    setSimulatedShips([]);
  }, []);

  return {
    simulatedShips,
    hydrated,
    addSimulatedShip,
    removeSimulatedShip,
    clearSimulatedShips,
  };
}
