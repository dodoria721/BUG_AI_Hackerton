# Energy Data

This directory stores the baseline data used by future energy saving and CO2 reduction decision logic.

## Files

- `raw/fuel-emission-factors.csv`: original fuel-specific CO2 factors.
- `raw/port-hourly-capacity.csv`: original Busan container terminal hourly capacity data.
- `raw/vessel-specs-sample.csv`: original sample vessel specifications.
- `raw/energy-assumptions.json`: original waiting fuel and congestion waiting assumptions.
- `raw/port-mis-sample.xlsx`: reference Port-MIS sample data from the provided pack.
- `fuel-factors.ts`: normalized fuel emission factors and fuel type inference helpers.
- `port-capacity.ts`: normalized Busan port hourly capacity rows and lookup helpers.
- `vessel-specs.ts`: normalized vessel sample specs and MMSI/IMO/name lookup helpers.
- `energy-assumptions.ts`: ship size, vessel type, waiting fuel, and congestion waiting assumptions.

## Calculation Notes

`cfTco2PerTon` means ton CO2 per ton fuel. The same ratio can be applied to kilogram units:

```txt
savedCo2Kg = savedFuelKg * cfTco2PerTon
```

Fuel savings and CO2 reductions are estimates based on vessel size, vessel type, speed, and congestion. They are not final operating instructions.

Waiting fuel consumption is an auxiliary/hoteling estimate. Do not mix it with at-sea main-engine fuel consumption without labeling the phase clearly.

Port-specific operational thresholds and Busan summary capacity values remain in `backend/ports/seed-port.ts`; this directory keeps reusable baseline data for energy calculations.
