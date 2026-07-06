import assert from "node:assert/strict";
import {
  FUEL_EMISSION_FACTORS,
  VESSEL_SPECS_SAMPLE,
  estimateWaitingMinutesByCongestion,
  getCapacityByRegion,
  getCapacityByTerminal,
  getFuelEmissionFactor,
  getTotalMixedCallsPerHour,
  getWaitingFuelKgPerHour,
  inferFuelType,
} from "../backend/data/energy";

for (const fuelType of ["HFO", "MDO_MGO", "LNG"] as const) {
  assert.ok(FUEL_EMISSION_FACTORS[fuelType], `${fuelType} factor must exist`);
  assert.ok(FUEL_EMISSION_FACTORS[fuelType].cfTco2PerTon > 0, `${fuelType} factor must be positive`);
}

assert.equal(getFuelEmissionFactor().fuelType, "HFO");
assert.equal(getFuelEmissionFactor("unknown-fuel").fuelType, "HFO");
assert.equal(inferFuelType({ vesselType: "LNG carrier", grossTonnage: 90000 }).fuelType, "LNG");
assert.equal(inferFuelType({ vesselType: "연안 탱커", grossTonnage: 3000 }).fuelType, "MDO_MGO");

assert.ok(getTotalMixedCallsPerHour() > 0);
assert.ok(getCapacityByRegion("신항").length > 0);
assert.equal(getCapacityByTerminal("신항2부두 TML2")?.callsPerHourMixed800Teu, 0.541);

for (const spec of VESSEL_SPECS_SAMPLE) {
  if (spec.grossTonnage != null) assert.equal(typeof spec.grossTonnage, "number");
}

const waitingFuel = getWaitingFuelKgPerHour({ grossTonnage: 50000, vesselType: "컨테이너선" });
assert.ok(waitingFuel.kgPerHour > 0);
assert.equal(waitingFuel.sizeClass, "large");
assert.equal(waitingFuel.normalizedVesselType, "container");

assert.deepEqual(estimateWaitingMinutesByCongestion(0.2), { waitingMinutes: 5, status: "원활" });
assert.deepEqual(estimateWaitingMinutesByCongestion(0.4), { waitingMinutes: 15, status: "보통" });
assert.deepEqual(estimateWaitingMinutesByCongestion(0.7), { waitingMinutes: 35, status: "주의" });
assert.deepEqual(estimateWaitingMinutesByCongestion(0.9), { waitingMinutes: 60, status: "혼잡" });
assert.deepEqual(estimateWaitingMinutesByCongestion(1.1), { waitingMinutes: 90, status: "포화" });

console.log("energy data validation passed");
