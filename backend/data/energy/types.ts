export type FuelType =
  | "MDO_MGO"
  | "LFO"
  | "HFO"
  | "LPG_PROPANE"
  | "LPG_BUTANE"
  | "ETHANE"
  | "LNG"
  | "METHANOL"
  | "ETHANOL";

export type Confidence = "low" | "medium" | "high";

export interface FuelEmissionFactor {
  fuelType: FuelType;
  fuelNameKo: string;
  fuelNameEn: string;
  cfTco2PerTon: number;
  lcvKjPerKg: number;
  carbonContent: number;
  note?: string;
}

export interface FuelEmissionFactorResult {
  factor: FuelEmissionFactor;
  isFallback: boolean;
  requestedFuelType?: string;
}

export interface FuelTypeInference {
  fuelType: FuelType;
  confidence: Confidence;
  reason: string;
}

export interface PortHourlyCapacity {
  region: string;
  terminal: string;
  operator?: string;
  berthCount: number;
  quayLengthM?: number;
  annualCapacityTeu?: number;
  teuPerHour: number;
  teuPerHourPerBerth?: number;
  callsPerHourLarge2500Teu: number;
  callsPerHourMixed800Teu: number;
  note?: string;
}

export interface VesselSpec {
  mmsi?: string;
  imo?: string;
  name?: string;
  aisName?: string;
  koreanName?: string;
  vesselType?: string;
  lengthM?: number;
  beamM?: number;
  grossTonnage?: number;
  deadweightTonnage?: number;
  builtYear?: number;
  flag?: string;
  finalStatus?: string;
  modelGroup?: string;
  source?: string;
}

export type ShipSizeClass = "small" | "medium" | "large" | "veryLarge" | "unknown";

export type NormalizedVesselType =
  | "container"
  | "bulk"
  | "tanker"
  | "lng"
  | "reefer"
  | "cruise"
  | "generalCargo"
  | "unknown";

export type CongestionWaitingStatus = "원활" | "보통" | "주의" | "혼잡" | "포화";

export interface WaitingFuelRate {
  sizeClass: ShipSizeClass;
  normalizedVesselType: NormalizedVesselType;
  baseKgPerHour: number;
  multiplier: number;
  kgPerHour: number;
  confidence: Confidence;
}

export interface CongestionWaitingEstimate {
  waitingMinutes: number;
  status: CongestionWaitingStatus;
}
