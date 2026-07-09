export interface TyphoonTrackPoint {
  time: string;
  lat: number;
  lon: number;
  centralPressureHpa?: number;
  maxWindSpeedMs?: number;
  forecast: boolean;
}

export interface TyphoonInfo {
  typhoonId: string;
  name: string;
  nameKr?: string;
  status: "발생" | "소멸" | "온대저기압화" | "예보";
  track: TyphoonTrackPoint[];
  source: string;
}
