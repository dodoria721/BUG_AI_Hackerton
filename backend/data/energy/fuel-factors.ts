import type {
  FuelEmissionFactor,
  FuelEmissionFactorResult,
  FuelType,
  FuelTypeInference,
} from "./types";
import { normalizeVesselType } from "./energy-assumptions";

export const FUEL_EMISSION_FACTORS: Record<FuelType, FuelEmissionFactor> = {
  MDO_MGO: {
    fuelType: "MDO_MGO",
    fuelNameKo: "디젤/경유",
    fuelNameEn: "Diesel/Gas Oil (MDO/MGO)",
    cfTco2PerTon: 3.206,
    lcvKjPerKg: 42700,
    carbonContent: 0.8744,
  },
  LFO: {
    fuelType: "LFO",
    fuelNameKo: "저유황유",
    fuelNameEn: "Light Fuel Oil (LFO)",
    cfTco2PerTon: 3.151,
    lcvKjPerKg: 41200,
    carbonContent: 0.8594,
    note: "증류유계 ULSFO(0.1%S)는 통상 LFO로 분류",
  },
  HFO: {
    fuelType: "HFO",
    fuelNameKo: "고유황 중유",
    fuelNameEn: "Heavy Fuel Oil (HFO)",
    cfTco2PerTon: 3.114,
    lcvKjPerKg: 40200,
    carbonContent: 0.8493,
    note: "잔사유계 VLSFO(0.5%S)도 실무상 HFO 계수 적용",
  },
  LPG_PROPANE: {
    fuelType: "LPG_PROPANE",
    fuelNameKo: "LPG(프로판)",
    fuelNameEn: "LPG (Propane)",
    cfTco2PerTon: 3.0,
    lcvKjPerKg: 46300,
    carbonContent: 0.8182,
  },
  LPG_BUTANE: {
    fuelType: "LPG_BUTANE",
    fuelNameKo: "LPG(부탄)",
    fuelNameEn: "LPG (Butane)",
    cfTco2PerTon: 3.03,
    lcvKjPerKg: 45700,
    carbonContent: 0.8264,
  },
  ETHANE: {
    fuelType: "ETHANE",
    fuelNameKo: "에탄",
    fuelNameEn: "Ethane",
    cfTco2PerTon: 2.927,
    lcvKjPerKg: 46400,
    carbonContent: 0.7989,
  },
  LNG: {
    fuelType: "LNG",
    fuelNameKo: "액화천연가스",
    fuelNameEn: "Liquefied Natural Gas (LNG)",
    cfTco2PerTon: 2.75,
    lcvKjPerKg: 48000,
    carbonContent: 0.75,
    note: "연소 기준. FuelEU는 메탄 슬립 포함 WtW 별도 계수 필요",
  },
  METHANOL: {
    fuelType: "METHANOL",
    fuelNameKo: "메탄올",
    fuelNameEn: "Methanol",
    cfTco2PerTon: 1.375,
    lcvKjPerKg: 19900,
    carbonContent: 0.375,
    note: "LCV가 낮아 동일 에너지당 연료량 약 2배 필요",
  },
  ETHANOL: {
    fuelType: "ETHANOL",
    fuelNameKo: "에탄올",
    fuelNameEn: "Ethanol",
    cfTco2PerTon: 1.913,
    lcvKjPerKg: 26800,
    carbonContent: 0.5217,
  },
};

export const FUEL_EMISSION_FACTOR_LIST = Object.values(FUEL_EMISSION_FACTORS);

const FUEL_TYPE_ALIASES: Record<string, FuelType> = {
  MDO: "MDO_MGO",
  MGO: "MDO_MGO",
  MDO_MGO: "MDO_MGO",
  "MDO/MGO": "MDO_MGO",
  DIESEL: "MDO_MGO",
  GASOIL: "MDO_MGO",
  LFO: "LFO",
  ULSFO: "LFO",
  HFO: "HFO",
  VLSFO: "HFO",
  LPG_PROPANE: "LPG_PROPANE",
  PROPANE: "LPG_PROPANE",
  LPG_BUTANE: "LPG_BUTANE",
  BUTANE: "LPG_BUTANE",
  ETHANE: "ETHANE",
  LNG: "LNG",
  METHANOL: "METHANOL",
  ETHANOL: "ETHANOL",
};

function normalizeFuelTypeKey(fuelType?: string): FuelType | undefined {
  if (!fuelType) return undefined;
  const key = fuelType.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return FUEL_TYPE_ALIASES[key];
}

export function getFuelEmissionFactor(fuelType?: string): FuelEmissionFactor {
  const normalized = normalizeFuelTypeKey(fuelType);
  return normalized ? FUEL_EMISSION_FACTORS[normalized] : FUEL_EMISSION_FACTORS.HFO;
}

export function getFuelEmissionFactorResult(fuelType?: string): FuelEmissionFactorResult {
  const normalized = normalizeFuelTypeKey(fuelType);
  return {
    factor: normalized ? FUEL_EMISSION_FACTORS[normalized] : FUEL_EMISSION_FACTORS.HFO,
    isFallback: !normalized,
    ...(fuelType ? { requestedFuelType: fuelType } : {}),
  };
}

export function inferFuelType(params: { vesselType?: string; grossTonnage?: number }): FuelTypeInference {
  const rawType = params.vesselType?.trim() ?? "";
  const normalizedType = normalizeVesselType(rawType);
  const gt = params.grossTonnage;

  if (rawType.toUpperCase().includes("LNG") || normalizedType === "lng") {
    return { fuelType: "LNG", confidence: "high", reason: "선종명에 LNG가 포함되어 LNG 연료 기준으로 추정" };
  }

  if ((gt != null && gt < 5000) || /연안|소형|coastal|small/i.test(rawType)) {
    return {
      fuelType: "MDO_MGO",
      confidence: gt != null || rawType ? "medium" : "low",
      reason: "GT 5,000 미만 또는 연안/소형 선박으로 보아 MDO/MGO 기준 추정",
    };
  }

  if (["container", "bulk", "tanker", "generalCargo"].includes(normalizedType)) {
    return {
      fuelType: "HFO",
      confidence: "medium",
      reason: "컨테이너/벌크/화물/탱커 계열 선종으로 HFO 기준 추정",
    };
  }

  return {
    fuelType: "HFO",
    confidence: "low",
    reason: "실제 연료 종류가 없어 HFO 기준 추정",
  };
}
