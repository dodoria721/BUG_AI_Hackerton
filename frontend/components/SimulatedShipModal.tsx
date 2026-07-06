"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { NewSimulatedShipInput, SimulatedVesselType } from "@/frontend/types/simulation";
import { SIMULATED_VESSEL_TYPE_LABELS, SIMULATED_VESSEL_TYPES } from "@/frontend/types/simulation";

interface SimulatedShipModalProps {
  open: boolean;
  position: { lat: number; lng: number } | null;
  defaultName: string;
  onCancel: () => void;
  onCreate: (ship: NewSimulatedShipInput) => void;
}

const fieldStyle = {
  width: "100%",
  height: 38,
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,.26)",
  background: "rgba(15,23,42,.84)",
  color: "#e7ecf5",
  padding: "0 10px",
  fontSize: 13,
  outline: "none",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
  fontSize: 11,
  color: "#8aa0c8",
  fontWeight: 800,
};

export default function SimulatedShipModal({ open, position, defaultName, onCancel, onCreate }: SimulatedShipModalProps) {
  const [name, setName] = useState(defaultName);
  const [sog, setSog] = useState("14");
  const [vesselType, setVesselType] = useState<SimulatedVesselType>("container");
  const [grossTonnage, setGrossTonnage] = useState("80000");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setSog("14");
    setVesselType("container");
    setGrossTonnage("80000");
    setError(null);
  }, [defaultName, open, position?.lat, position?.lng]);

  if (!open || !position) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!position) return;

    const parsedSog = Number(sog);
    const parsedGrossTonnage = Number(grossTonnage);

    if (!Number.isFinite(parsedSog) || parsedSog < 3 || parsedSog > 30) {
      setError("속도 SOG는 3kn 이상 30kn 이하로 입력해주세요.");
      return;
    }
    if (!Number.isFinite(parsedGrossTonnage) || parsedGrossTonnage < 100) {
      setError("총톤수 GT는 100 이상으로 입력해주세요.");
      return;
    }

    onCreate({
      name: name.trim() || defaultName,
      lat: position.lat,
      lng: position.lng,
      sog: parsedSog,
      vesselType,
      grossTonnage: Math.round(parsedGrossTonnage),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="가상 선박 생성"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(3,7,18,.68)",
        backdropFilter: "blur(6px)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(440px, 100%)",
          borderRadius: 12,
          border: "1px solid rgba(120,160,255,.18)",
          background: "rgba(11,18,34,.98)",
          boxShadow: "0 24px 70px rgba(0,0,0,.5)",
          color: "#e7ecf5",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 900, letterSpacing: ".08em" }}>SIMULATION</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, lineHeight: 1.2 }}>가상 선박 생성</h2>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8aa0c8", lineHeight: 1.5 }}>
              우클릭한 위치에 운영자 검토용 입항 시나리오 선박을 추가합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="닫기"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.04)",
              color: "#cbd5e1",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 14, padding: "9px 10px", borderRadius: 8, background: "rgba(56,189,248,.08)", color: "#bae6fd", fontSize: 11.5 }}>
          위치: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            선박명
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={defaultName} style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            속도 SOG (kn)
            <input type="number" min={3} max={30} step={0.1} value={sog} onChange={(event) => setSog(event.target.value)} style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            총톤수 GT
            <input type="number" min={100} step={100} value={grossTonnage} onChange={(event) => setGrossTonnage(event.target.value)} style={fieldStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            선종
            <select value={vesselType} onChange={(event) => setVesselType(event.target.value as SimulatedVesselType)} style={fieldStyle}>
              {SIMULATED_VESSEL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SIMULATED_VESSEL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div style={{ marginTop: 12, color: "#fecaca", fontSize: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 38,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,.22)",
              background: "transparent",
              color: "#cbd5e1",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            type="submit"
            style={{
              height: 38,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#38bdf8",
              color: "#082f49",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            생성
          </button>
        </div>
      </form>
    </div>
  );
}
