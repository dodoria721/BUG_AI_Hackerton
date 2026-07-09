// aisstream.io(wss://stream.aisstream.io/v0/stream) 메시지 중 이 프로젝트가 쓰는
// 필드만 최소로 정의한다. 전체 스펙: https://aisstream.io/documentation

export interface AisMetaData {
  MMSI: number;
  ShipName?: string;
  time_utc: string;
}

export interface AisPositionReport {
  Latitude: number;
  Longitude: number;
  Sog: number; // Speed Over Ground (knots)
  Cog: number; // Course Over Ground (degrees, 0~360)
  NavigationalStatus: number; // ITU-R M.1371 항행 상태 코드
}

export interface AisShipStaticData {
  Name?: string;
  CallSign?: string; // 호출부호 — backend/portmis 매칭 키로 쓴다
  Destination?: string; // 자유 텍스트, "@" 패딩 포함 — busan-filter.ts에서 정제
  ImoNumber?: number; // IMO 선박식별번호 (미제공 시 0)
  Type?: number; // 선종코드(ITU-R M.1371, 0~99) — 대형 상선/소형선 분류용. backend/ais/ship-type.ts
}

// PositionReport/ShipStaticData 둘 다 같은 envelope 모양이라 optional 필드로 묶어서 받는다.
// discriminated union 대신 이렇게 하면 좁히기(narrowing)가 단순해진다.
export interface AisEnvelope {
  MessageType: string;
  MetaData: AisMetaData;
  Message: {
    PositionReport?: AisPositionReport;
    ShipStaticData?: AisShipStaticData;
  };
}
