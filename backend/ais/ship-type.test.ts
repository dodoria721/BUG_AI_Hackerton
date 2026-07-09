import assert from "node:assert/strict";
import { aisShipTypeClass } from "./ship-type";

// 대형 상선(commercial): HSC 40~49, 여객 60~69, 화물 70~79, 탱커 80~89
assert.equal(aisShipTypeClass(70), "commercial"); // 화물
assert.equal(aisShipTypeClass(89), "commercial"); // 탱커
assert.equal(aisShipTypeClass(60), "commercial"); // 여객
assert.equal(aisShipTypeClass(40), "commercial"); // 고속선

// 소형·작업선(small): 어선 30, 예인 31~32, 도선 50, 예선 52 등
assert.equal(aisShipTypeClass(30), "small"); // 어선
assert.equal(aisShipTypeClass(52), "small"); // 예선(tug)
assert.equal(aisShipTypeClass(37), "small"); // 유람선(pleasure)
assert.equal(aisShipTypeClass(50), "small"); // 도선(pilot)

// 기타/미정의(other): 0·미제공·WIG 20~29·기타 90~99·범위 밖
assert.equal(aisShipTypeClass(0), "other");
assert.equal(aisShipTypeClass(undefined), "other");
assert.equal(aisShipTypeClass(null), "other");
assert.equal(aisShipTypeClass(25), "other"); // WIG
assert.equal(aisShipTypeClass(99), "other");
assert.equal(aisShipTypeClass(120), "other"); // 범위 밖

console.log("ship-type validation passed");
