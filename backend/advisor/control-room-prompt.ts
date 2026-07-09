import type { ControlRoomPriorityTarget, ControlRoomSnapshot } from "@/backend/services/control-room-service";

function compactSnapshot(snapshot: ControlRoomSnapshot, priorityTargets: ControlRoomPriorityTarget[]) {
  return {
    generatedAt: snapshot.generatedAt,
    ports: snapshot.ports,
    ships: snapshot.ships,
    collisionRisk: snapshot.collisionRisk,
    energy: snapshot.energy,
    routeScenario: snapshot.routeScenario,
    priorityTargets: priorityTargets.map((target) => ({
      rank: target.rank,
      shipName: target.shipName,
      destinationPortName: target.destinationPortName,
      currentSpeedKn: target.currentSpeedKn,
      recommendedSpeedKn: target.recommendedSpeedKn,
      priorityScore: target.priorityScore,
      reasonBasis: target.reasonBasis,
      metrics: target.metrics,
      confidence: target.confidence,
    })),
    dataSources: snapshot.dataSources,
    limitations: snapshot.limitations,
  };
}

export function buildControlRoomAdvisorPrompt(
  snapshot: ControlRoomSnapshot,
  priorityTargets: ControlRoomPriorityTarget[]
): string {
  return `You are an AI assistant for a Busan Port operations control room.
Write a Korean operations briefing for human operator review.

Important rules:
- Do not calculate new numeric values.
- Use only the backend-computed values in the provided JSON.
- Do not reorder priorityTargets. Keep their rank order exactly.
- Do not change ETA, speed, waiting time, fuel, CO2, congestion, or score values.
- Safety first: treat collisionRisk (close-quarters CPA/TCPA alerts) as the top priority.
  If collisionRisk.dangerCount > 0, riskLevel must be "high" and the headline and risks must mention the collision risk.
  Reflect collisionRisk in summary/priorityActions/risks using its backend values (cpaNm, tcpaMinutes, vessel names).
- This is not navigation instruction, automatic control, or a safety guarantee.
- Say that operators must verify weather, channel, VTS, pilotage, and vessel safety conditions.
- Output only a JSON object. Do not wrap it in markdown.

Required JSON shape:
{
  "riskLevel": "low" | "medium" | "high",
  "headline": "short Korean headline",
  "summary": "2-3 sentence Korean summary",
  "congestionCauses": ["cause"],
  "priorityActions": ["action"],
  "priorityVessels": [
    {
      "rank": 1,
      "shipName": "same as input",
      "reason": "Korean reason using backend values only",
      "expectedImpact": "Korean impact using backend values only"
    }
  ],
  "routeScenarioSummary": "Korean summary",
  "risks": ["risk"],
  "nextSteps": ["next step"],
  "disclaimer": "AI 브리핑은 백엔드 계산 결과를 바탕으로 생성된 운영자 검토용 요약이며 실제 항해 지시가 아닙니다."
}

Backend-computed snapshot:
${JSON.stringify(compactSnapshot(snapshot, priorityTargets), null, 2)}`;
}
