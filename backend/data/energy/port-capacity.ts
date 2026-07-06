import type { PortHourlyCapacity } from "./types";

export const BUSAN_PORT_HOURLY_CAPACITY: PortHourlyCapacity[] = [
  {
    region: "북항",
    terminal: "자성대",
    operator: "HBCT",
    berthCount: 5,
    quayLengthM: 1447,
    annualCapacityTeu: 1722000,
    teuPerHour: 196.6,
    teuPerHourPerBerth: 39.3,
    callsPerHourLarge2500Teu: 0.079,
    callsPerHourMixed800Teu: 0.246,
    note: "1978 개장, 북항 재개발 대상",
  },
  {
    region: "북항",
    terminal: "신선대",
    operator: "BPT(신선대)",
    berthCount: 5,
    quayLengthM: 1500,
    annualCapacityTeu: 2236000,
    teuPerHour: 255.3,
    teuPerHourPerBerth: 51.1,
    callsPerHourLarge2500Teu: 0.102,
    callsPerHourMixed800Teu: 0.319,
  },
  {
    region: "북항",
    terminal: "감만",
    operator: "BPT(감만)",
    berthCount: 4,
    quayLengthM: 1400,
    annualCapacityTeu: 1600000,
    teuPerHour: 182.6,
    teuPerHourPerBerth: 45.7,
    callsPerHourLarge2500Teu: 0.073,
    callsPerHourMixed800Teu: 0.228,
  },
  {
    region: "북항",
    terminal: "신감만",
    operator: "HBGT",
    berthCount: 3,
    quayLengthM: 826,
    annualCapacityTeu: 819000,
    teuPerHour: 93.5,
    teuPerHourPerBerth: 31.2,
    callsPerHourLarge2500Teu: 0.037,
    callsPerHourMixed800Teu: 0.117,
  },
  {
    region: "신항",
    terminal: "신항1부두 TML1",
    operator: "PNIT",
    berthCount: 3,
    quayLengthM: 1200,
    annualCapacityTeu: 2090000,
    teuPerHour: 238.6,
    teuPerHourPerBerth: 79.5,
    callsPerHourLarge2500Teu: 0.095,
    callsPerHourMixed800Teu: 0.298,
  },
  {
    region: "신항",
    terminal: "신항2부두 TML2",
    operator: "PNC",
    berthCount: 6,
    quayLengthM: 2000,
    annualCapacityTeu: 3790000,
    teuPerHour: 432.6,
    teuPerHourPerBerth: 72.1,
    callsPerHourLarge2500Teu: 0.173,
    callsPerHourMixed800Teu: 0.541,
    note: "신항 최대",
  },
  {
    region: "신항",
    terminal: "신항3부두 TML3",
    operator: "HJNC",
    berthCount: 2,
    quayLengthM: 1100,
    annualCapacityTeu: 2310000,
    teuPerHour: 263.7,
    teuPerHourPerBerth: 131.8,
    callsPerHourLarge2500Teu: 0.105,
    callsPerHourMixed800Teu: 0.33,
  },
  {
    region: "신항",
    terminal: "신항4부두 TML4",
    operator: "HPNT",
    berthCount: 2,
    quayLengthM: 1150,
    annualCapacityTeu: 1940000,
    teuPerHour: 221.5,
    teuPerHourPerBerth: 110.7,
    callsPerHourLarge2500Teu: 0.089,
    callsPerHourMixed800Teu: 0.277,
  },
  {
    region: "신항",
    terminal: "신항5부두 TML5",
    operator: "BNCT",
    berthCount: 4,
    quayLengthM: 1400,
    annualCapacityTeu: 2440000,
    teuPerHour: 278.5,
    teuPerHourPerBerth: 69.6,
    callsPerHourLarge2500Teu: 0.111,
    callsPerHourMixed800Teu: 0.348,
  },
  {
    region: "신항",
    terminal: "신항6부두 TML6",
    operator: "BCT",
    berthCount: 3,
    quayLengthM: 1050,
    annualCapacityTeu: 1950000,
    teuPerHour: 222.6,
    teuPerHourPerBerth: 74.2,
    callsPerHourLarge2500Teu: 0.089,
    callsPerHourMixed800Teu: 0.278,
  },
  {
    region: "신항",
    terminal: "신항7부두 TML7",
    operator: "DGT(동원)",
    berthCount: 3,
    quayLengthM: 1050,
    annualCapacityTeu: 1550000,
    teuPerHour: 176.9,
    teuPerHourPerBerth: 59,
    callsPerHourLarge2500Teu: 0.071,
    callsPerHourMixed800Teu: 0.221,
    note: "2-5단계, 개략치",
  },
  {
    region: "북항",
    terminal: "소계",
    berthCount: 17,
    quayLengthM: 5173,
    annualCapacityTeu: 6377000,
    teuPerHour: 728,
    callsPerHourLarge2500Teu: 0.291,
    callsPerHourMixed800Teu: 0.91,
  },
  {
    region: "신항",
    terminal: "소계",
    berthCount: 23,
    quayLengthM: 8950,
    annualCapacityTeu: 16070000,
    teuPerHour: 1834.5,
    callsPerHourLarge2500Teu: 0.734,
    callsPerHourMixed800Teu: 2.293,
  },
  {
    region: "전체",
    terminal: "합계",
    berthCount: 40,
    quayLengthM: 14123,
    annualCapacityTeu: 22447000,
    teuPerHour: 2562.4,
    callsPerHourLarge2500Teu: 1.025,
    callsPerHourMixed800Teu: 3.203,
  },
];

function totalRow(): PortHourlyCapacity | undefined {
  return BUSAN_PORT_HOURLY_CAPACITY.find((row) => row.region === "전체" && row.terminal === "합계");
}

function terminalRows(): PortHourlyCapacity[] {
  return BUSAN_PORT_HOURLY_CAPACITY.filter((row) => row.terminal !== "소계" && row.terminal !== "합계");
}

export function getTotalMixedCallsPerHour(): number {
  return totalRow()?.callsPerHourMixed800Teu ?? terminalRows().reduce((sum, row) => sum + row.callsPerHourMixed800Teu, 0);
}

export function getTotalLargeCallsPerHour(): number {
  return totalRow()?.callsPerHourLarge2500Teu ?? terminalRows().reduce((sum, row) => sum + row.callsPerHourLarge2500Teu, 0);
}

export function getCapacityByRegion(region: string): PortHourlyCapacity[] {
  const normalized = region.trim();
  return BUSAN_PORT_HOURLY_CAPACITY.filter((row) => row.region === normalized);
}

export function getCapacityByTerminal(terminal: string): PortHourlyCapacity | undefined {
  const normalized = terminal.trim().toLowerCase();
  return BUSAN_PORT_HOURLY_CAPACITY.find((row) => row.terminal.toLowerCase() === normalized);
}
