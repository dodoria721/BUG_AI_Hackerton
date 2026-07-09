import assert from "node:assert/strict";
import type { Ship } from "../ports/port-types";
import { BUSAN_PORT } from "../ports/seed-port";
import { classifyCpaRisk, classifyMonitorClass, computeCpa, detectCloseQuarters, encounterType, isMonitoredVessel } from "./collision-risk";

// 테스트용 선박 생성 헬퍼 — 필수 필드만 채운다. 관제 대상이 되도록 총톤수를 실어 둔다.
function ship(mmsi: string, lat: number, lon: number, sog: number, cog: number): Ship {
  return { mmsi, name: `SHIP-${mmsi}`, lat, lon, sog, cog, eta: "", status: "underway", grossTonnage: 5000 };
}

const t = BUSAN_PORT.collisionRisk;

// ── 1) 정면 충돌 침로: 같은 위도에서 마주보고 접근 → CPA≈0, TCPA 양수, danger ──
// A(129.00)는 동진(90°), B(129.05)는 서진(270°). 경도차 0.05°≈2.46NM, 접근속도 20kn.
{
  const a = ship("A", 35.0, 129.0, 10, 90);
  const b = ship("B", 35.0, 129.05, 10, 270);
  const cpa = computeCpa(a, b);
  assert.ok(cpa.cpaNm < 0.05, `head-on CPA should be ~0, got ${cpa.cpaNm}`);
  assert.ok(cpa.tcpaMinutes > 6 && cpa.tcpaMinutes < 9, `TCPA ~7.4min, got ${cpa.tcpaMinutes}`);
  assert.equal(cpa.closing, true);
  assert.equal(classifyCpaRisk(cpa, t), "danger");
  assert.equal(encounterType(a, b, t), "head-on");
}

// ── 2) 멀어지는 중: 서로 반대로 벌어짐 → closing=false, clear ──
{
  const a = ship("A", 35.0, 129.0, 10, 270); // 서진(왼쪽으로)
  const b = ship("B", 35.0, 129.05, 10, 90); // 동진(오른쪽으로)
  const cpa = computeCpa(a, b);
  assert.equal(cpa.closing, false, "diverging pair must not be closing");
  assert.equal(classifyCpaRisk(cpa, t), "clear");
}

// ── 3) 같은 침로·속력(상대속도 0): 거리 불변 → TCPA 0, CPA=현재거리, clear ──
{
  const a = ship("A", 35.0, 129.0, 10, 0); // 둘 다 정북 10kn
  const b = ship("B", 35.02, 129.0, 10, 0);
  const cpa = computeCpa(a, b);
  assert.equal(cpa.tcpaMinutes, 0);
  assert.ok(Math.abs(cpa.cpaNm - cpa.currentRangeNm) < 1e-6, "parallel: CPA equals current range");
  assert.equal(cpa.closing, false);
  assert.equal(classifyCpaRisk(cpa, t), "clear");
}

// ── 4) 안전 통과: 위도로 1.2NM 벌어진 채 교차 → CPA≈1.2NM > 경보거리 → clear ──
{
  const a = ship("A", 35.0, 129.0, 10, 90);
  const b = ship("B", 35.02, 129.05, 10, 270); // 위도 0.02°≈1.2NM 위쪽
  const cpa = computeCpa(a, b);
  assert.ok(Math.abs(cpa.cpaNm - 1.2) < 0.1, `safe-pass CPA ~1.2NM, got ${cpa.cpaNm}`);
  assert.equal(classifyCpaRisk(cpa, t), "clear");
}

// ── 5) detectCloseQuarters: danger 쌍이 맨 위, 정박선 쌍은 제외 ──
{
  const ships: Ship[] = [
    ship("A", 35.0, 129.0, 10, 90), // ─┐ 정면 충돌(danger)
    ship("B", 35.0, 129.05, 10, 270), // ─┘
    ship("M1", 35.1, 129.1, 0, 0), // ─┐ 둘 다 정지(접안·묘박) → 제외
    ship("M2", 35.1005, 129.1, 0, 0), // ─┘
  ];
  const alerts = detectCloseQuarters(ships, BUSAN_PORT);
  assert.equal(alerts.length, 1, `only the moving danger pair should alert, got ${alerts.length}`);
  assert.equal(alerts[0].risk, "danger");
  assert.deepEqual([alerts[0].aMmsi, alerts[0].bMmsi].sort(), ["A", "B"]);
  assert.equal(alerts[0].encounter, "head-on");
}

// ── 6) 정렬: danger가 warning보다 먼저 ──
{
  const ships: Ship[] = [
    ship("A", 35.0, 129.0, 10, 90), // A-B 정면(danger, CPA~0)
    ship("B", 35.0, 129.05, 10, 270),
    ship("C", 35.2, 128.6, 10, 90), // C-D 경보(warning, CPA~0.4NM)
    ship("D", 35.2067, 128.65, 10, 270), // 위도 0.0067°≈0.4NM
  ];
  const alerts = detectCloseQuarters(ships, BUSAN_PORT);
  assert.ok(alerts.length >= 2, `expected >=2 alerts, got ${alerts.length}`);
  assert.equal(alerts[0].risk, "danger", "danger must sort first");
  assert.ok(
    alerts.some((x) => x.risk === "warning"),
    "the offset pair should be a warning"
  );
}

// ── 7) 저속 근접 클러스터: 아주 가깝지만 상대속도 < 2kn → 경보 제외(정박지 잡음 제거) ──
// 두 선박 모두 0.6kn(정지 판정 0.5kn 초과)이라 ignoreSpeed로는 안 걸러지지만, 느리게 좁혀지므로 clear.
{
  const a = ship("A", 35.0, 129.0, 0.6, 90); // 동진 0.6kn
  const b = ship("B", 35.0, 129.004, 0.6, 270); // 서진 0.6kn, 0.2NM 거리에서 마주봄
  const cpa = computeCpa(a, b);
  assert.ok(cpa.currentRangeNm < 0.25, "매우 가까운 쌍");
  assert.ok(cpa.relativeSpeedKn < t.minClosingSpeedKn, "상대속도가 임계 미만");
  assert.equal(classifyCpaRisk(cpa, t), "clear", "저속 근접 쌍은 경보하지 않는다");
  assert.equal(detectCloseQuarters([a, b], BUSAN_PORT).length, 0);
}

// ── 8) 관제 분류: 선종코드 우선, 없으면 총톤수/IMO(기타 정보) ──
{
  const base: Ship = { mmsi: "X", name: "X", lat: 35, lon: 129, sog: 10, cog: 0, eta: "", status: "underway" };
  // 1순위: AIS 선종코드로 대형 상선/소형선 확정 (총톤수가 반대로 있어도 코드가 우선)
  assert.equal(classifyMonitorClass({ ...base, aisShipType: 70 }, t), "commercial", "화물선 코드 → 관제");
  assert.equal(classifyMonitorClass({ ...base, aisShipType: 30, grossTonnage: 9000 }, t), "small", "어선 코드는 총톤수보다 우선 → 제외");
  // 2순위: 선종코드 없으면 기타 정보(총톤수 → IMO)
  assert.equal(classifyMonitorClass({ ...base, grossTonnage: 5000 }, t), "commercial", "총톤수 300 이상 → 관제");
  assert.equal(classifyMonitorClass({ ...base, grossTonnage: 80 }, t), "small", "총톤수 300 미만 → 소형선");
  assert.equal(classifyMonitorClass({ ...base, imo: "9123456" }, t), "commercial", "총톤수 미상 + IMO → 관제");
  assert.equal(classifyMonitorClass(base, t), "unknown", "근거 없음 → unknown");
  // isMonitoredVessel = commercial 여부
  assert.equal(isMonitoredVessel({ ...base, aisShipType: 80 }, t), true);
  assert.equal(isMonitoredVessel(base, t), false);
}

// ── 9) 소형선은 충돌 침로여도 경보에서 제외 ──
{
  const bigA = { ...ship("A", 35.0, 129.0, 12, 90) }; // GT 5000
  const smallB: Ship = { mmsi: "B", name: "어선B", lat: 35.0, lon: 129.05, sog: 12, cog: 270, eta: "", status: "underway", grossTonnage: 80 };
  const alerts = detectCloseQuarters([bigA, smallB], BUSAN_PORT);
  assert.equal(alerts.length, 0, "소형선이 낀 쌍은 관제 대상이 아니라 경보 없음");
}

console.log("collision-risk validation passed");
