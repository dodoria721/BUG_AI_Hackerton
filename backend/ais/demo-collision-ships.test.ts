import assert from "node:assert/strict";
import { BUSAN_PORT } from "../ports/seed-port";
import { detectCloseQuarters } from "../prediction/collision-risk";
import { buildDemoCollisionShips } from "./demo-collision-ships";

// 데모 선박이 실제로 danger 1건 + warning 1건을 만들어내는지 확인한다.
// (좌표 오프셋이 바뀌어 경보가 사라지면 데모가 밋밋해지므로 회귀 방지용.)
const ships = buildDemoCollisionShips(BUSAN_PORT);
assert.equal(ships.length, 4);

const alerts = detectCloseQuarters(ships, BUSAN_PORT);
assert.ok(
  alerts.some((a) => a.risk === "danger" && a.encounter === "head-on"),
  "정면 조우(danger)가 있어야 한다"
);
assert.ok(
  alerts.some((a) => a.risk === "warning" && a.encounter === "overtaking"),
  "추월(warning)이 있어야 한다"
);
// 심각도 정렬 확인: 맨 앞은 danger.
assert.equal(alerts[0].risk, "danger");

console.log("demo-collision-ships validation passed");
