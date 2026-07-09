import { generateText } from "ai";
import { advisorModel } from "@/backend/models";
import type { ControlRoomPriorityTarget, ControlRoomSnapshot } from "@/backend/services/control-room-service";
import { buildControlRoomAdvisorPrompt } from "./control-room-prompt";
import {
  parseControlRoomBriefingResult,
  type ControlRoomBriefingResult,
  type ControlRoomRiskLevel,
} from "./control-room-parse";

export type { ControlRoomBriefingResult } from "./control-room-parse";

export const CONTROL_ROOM_DISCLAIMER =
  "AI 브리핑은 백엔드 계산 결과를 바탕으로 생성된 운영자 검토용 요약이며 실제 항해 지시가 아닙니다.";

function riskLevel(snapshot: ControlRoomSnapshot): ControlRoomRiskLevel {
  // 안전 우선 — 근접 충돌위험(danger)이 있으면 혼잡도와 무관하게 최고 위험.
  if (snapshot.collisionRisk.dangerCount > 0) return "high";
  const maxLevel = Math.max(0, ...snapshot.ports.map((port) => port.congestionLevel));
  if (maxLevel >= 0.75 || snapshot.energy.recommendedCount >= 5) return "high";
  if (snapshot.collisionRisk.warningCount > 0 || maxLevel >= 0.45 || snapshot.energy.recommendedCount > 0) return "medium";
  return "low";
}

// 근접 충돌위험을 사람이 읽는 한 줄로 요약한다(경보 없으면 undefined).
function collisionSummaryLine(snapshot: ControlRoomSnapshot): string | undefined {
  const { dangerCount, warningCount, topAlerts } = snapshot.collisionRisk;
  if (dangerCount === 0 && warningCount === 0) return undefined;
  const top = topAlerts[0];
  const topText = top
    ? ` 최우선: ${top.aName}↔${top.bName} (최근접 ${top.cpaNm}해리, ${top.tcpaMinutes}분 후)`
    : "";
  return `근접 충돌위험 위험 ${dangerCount}건·주의 ${warningCount}건.${topText}`;
}

function formatKg(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}kg`;
}

export function buildControlRoomFallbackBriefing(
  snapshot: ControlRoomSnapshot,
  priorityTargets: ControlRoomPriorityTarget[]
): ControlRoomBriefingResult {
  const highestPort = [...snapshot.ports].sort((a, b) => b.congestionLevel - a.congestionLevel)[0];
  const risk = riskLevel(snapshot);
  const collision = collisionSummaryLine(snapshot);

  return {
    source: "rule-based-fallback",
    riskLevel: risk,
    headline:
      snapshot.collisionRisk.dangerCount > 0
        ? `근접 충돌위험 ${snapshot.collisionRisk.dangerCount}건 — 즉시 확인 필요`
        : highestPort
          ? `${highestPort.name} 혼잡도 ${Math.round(highestPort.congestionLevel * 100)}% 기준 운영 검토 필요`
          : "현재 항만 운영 브리핑",
    summary:
      "현재 브리핑은 백엔드가 계산한 항만 혼잡도와 JIT 감속 권고 결과를 바탕으로 구성했습니다. OpenAI 응답을 사용할 수 없는 경우에도 규칙 기반 요약으로 운영자가 검토할 핵심 항목을 표시합니다.",
    congestionCauses: highestPort
      ? [
          `${highestPort.name}의 현재 혼잡도는 ${Math.round(highestPort.congestionLevel * 100)}%이며 상태는 ${highestPort.congestionStatus}입니다.`,
          "Port-MIS 혼잡도, AIS 선박 현황, JIT 계산 결과를 함께 검토해야 합니다.",
        ]
      : ["현재 표시 가능한 항만 혼잡도 데이터가 제한적입니다."],
    priorityActions: [
      ...(collision ? ["근접 충돌위험 대상 선박의 침로·속력을 즉시 확인하고 필요 시 교신·회피를 판단하세요."] : []),
      ...(priorityTargets.length > 0
        ? [
            "JIT 감속 권고 대상 선박을 우선 검토하고 실제 운항 조건과 맞는지 확인하세요.",
            "권고 속도 적용 전 VTS, 도선, 기상, 항로 안전 조건을 운영자가 재확인하세요.",
          ]
        : [
            "현재 JIT 감속 권고 대상 선박이 없습니다.",
            "혼잡도와 AIS/Port-MIS 데이터 최신성을 먼저 확인하세요.",
          ]),
    ],
    priorityVessels: priorityTargets.slice(0, 5).map((target) => ({
      rank: target.rank,
      shipName: target.shipName,
      reason: target.reasonBasis.join(" / "),
      expectedImpact: `대기 ${target.metrics.reducedWaitingMinutes}분 감소, 연료 ${formatKg(
        target.metrics.estimatedFuelSavedKg
      )} 절감, CO2 ${formatKg(target.metrics.estimatedCo2ReducedKg)} 감축 추정`,
    })),
    routeScenarioSummary:
      snapshot.routeScenario && snapshot.routeScenario.recommendedRouteCount > 0
        ? snapshot.routeScenario.highlights.join(" ")
        : "서버에 저장된 시뮬레이션 경로 추천 결과가 없어 경로 리포트는 참고 항목으로만 표시합니다.",
    risks: [
      ...(collision ? [collision] : []),
      "본 브리핑은 운영자 검토용 요약이며 실제 항해 지시가 아닙니다.",
      "AIS, Port-MIS, 기상, 도선, 항로 안전 조건은 실제 운영자가 별도로 확인해야 합니다.",
    ],
    nextSteps: [
      "우선순위 선박의 권고 속도와 ETA를 확인하세요.",
      "혼잡도가 높은 항만 권역의 입항 예정과 현재 정박 현황을 재점검하세요.",
      "OpenAI API 키가 없거나 호출이 실패하면 현재처럼 규칙 기반 fallback 브리핑이 표시됩니다.",
    ],
    disclaimer: CONTROL_ROOM_DISCLAIMER,
  };
}

export async function generateControlRoomAdvisor(
  snapshot: ControlRoomSnapshot,
  priorityTargets: ControlRoomPriorityTarget[]
): Promise<ControlRoomBriefingResult> {
  if (!process.env.OPENAI_API_KEY) return buildControlRoomFallbackBriefing(snapshot, priorityTargets);

  try {
    const { text } = await generateText({
      model: advisorModel,
      prompt: buildControlRoomAdvisorPrompt(snapshot, priorityTargets),
    });
    return parseControlRoomBriefingResult(text) ?? buildControlRoomFallbackBriefing(snapshot, priorityTargets);
  } catch (error) {
    console.error("[control-room-advisor]", error);
    return buildControlRoomFallbackBriefing(snapshot, priorityTargets);
  }
}
