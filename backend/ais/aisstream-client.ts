// aisstream.io WebSocket 연결 — REST가 아니라 지속 연결 스트림이라 이 파일만 연결/재연결을
// 담당하고, 메시지 해석·필터링·저장은 호출부(ingest-aisstream.ts)에서 한다.

import WebSocket from "ws";
import type { AisEnvelope } from "./aisstream-types";
import type { BoundingBox } from "./busan-filter";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const RECONNECT_DELAY_MS = 5_000;
// 부산항 bbox는 트래픽이 꾸준한 편이라, 이 시간 동안 메시지가 하나도 없으면 좀비 연결로
// 간주하고 강제 재연결한다. 노트북 절전·네트워크 순단 시 TCP 연결이 close/error 이벤트
// 없이 반쯤 죽어버리는 경우(half-open)가 있어서, close/error만으로는 못 잡는다.
const IDLE_TIMEOUT_MS = 90_000;
const WATCHDOG_INTERVAL_MS = 15_000;

export interface SubscribeOptions {
  apiKey: string;
  boundingBoxes: BoundingBox[];
  onMessage: (msg: AisEnvelope) => void;
  onStatus?: (status: "connected" | "disconnected" | "error" | "watchdog-reconnect", detail?: unknown) => void;
}

/**
 * aisstream.io에 연결해 구독하고, 연결이 끊기거나(close/error) 일정 시간 메시지가
 * 끊기면(watchdog) 자동으로 재연결한다. 반환된 함수를 호출하면 재연결을 멈추고 연결을 닫는다.
 */
export function subscribeAisStream(options: SubscribeOptions): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let lastMessageAt = Date.now();

  function connect() {
    lastMessageAt = Date.now();
    ws = new WebSocket(AISSTREAM_URL);

    ws.on("open", () => {
      lastMessageAt = Date.now();
      options.onStatus?.("connected");
      ws?.send(
        JSON.stringify({
          APIKey: options.apiKey,
          BoundingBoxes: options.boundingBoxes,
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
        })
      );
    });

    ws.on("message", (raw) => {
      lastMessageAt = Date.now();
      try {
        options.onMessage(JSON.parse(raw.toString()) as AisEnvelope);
      } catch (err) {
        options.onStatus?.("error", err);
      }
    });

    ws.on("close", () => {
      options.onStatus?.("disconnected");
      if (!stopped) setTimeout(connect, RECONNECT_DELAY_MS);
    });

    ws.on("error", (err) => {
      options.onStatus?.("error", err);
    });
  }

  connect();

  // 좀비 연결 감시: 주기적으로 마지막 메시지 이후 경과 시간을 확인해 너무 오래 조용하면
  // 소켓을 강제로 끊는다 — 그러면 위 close 핸들러가 재연결을 트리거한다.
  const watchdog = setInterval(() => {
    if (stopped || !ws) return;
    const idleMs = Date.now() - lastMessageAt;
    if (idleMs > IDLE_TIMEOUT_MS) {
      options.onStatus?.("watchdog-reconnect", { idleMs });
      ws.terminate();
    }
  }, WATCHDOG_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(watchdog);
    ws?.close();
  };
}
