"use client";

import { useCallback, useEffect, useState } from "react";
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

function isSimulatedShip(value: unknown): value is SimulatedShip {
  if (!value || typeof value !== "object") return false;
  const ship = value as Record<string, unknown>;
  return (
    typeof ship.id === "string" &&
    typeof ship.name === "string" &&
    isFiniteNumber(ship.lat) &&
    isFiniteNumber(ship.lng) &&
    isFiniteNumber(ship.sog) &&
    ship.status === "underway" &&
    isSimulatedVesselType(ship.vesselType) &&
    isFiniteNumber(ship.grossTonnage) &&
    ship.source === "simulation" &&
    typeof ship.createdAt === "string"
  );
}

function parseStoredShips(raw: string | null): SimulatedShip[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSimulatedShip);
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
