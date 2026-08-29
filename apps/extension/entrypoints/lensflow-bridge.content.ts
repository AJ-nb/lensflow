import { defineContentScript } from "wxt/utils/define-content-script";
import {
  LENSFLOW_BRIDGE_VERSION,
  assertBridgePayloadSize,
  bridgeRequestSchema,
  isAllowedLensflowBridgeOrigin,
  type BridgeResponse
} from "@lensflow/contracts";
import type { RuntimeResponse } from "../shared/types";

const CONNECT = "LENSFLOW_BRIDGE_CONNECT";
const CONNECTED = "LENSFLOW_BRIDGE_CONNECTED";

export default defineContentScript({
  matches: ["https://aj-nb.github.io/lensflow/*"],
  runAt: "document_start",
  main(ctx) {
    const ports = new Set<MessagePort>();
    const allowedOrigin = (origin: string) => isAllowedLensflowBridgeOrigin(origin, location.pathname, import.meta.env.DEV);

    const onConnect = (event: MessageEvent) => {
      if (event.source !== window || !allowedOrigin(event.origin)) return;
      const data = event.data as { type?: unknown; nonce?: unknown; version?: unknown };
      if (data?.type !== CONNECT || typeof data.nonce !== "string" || data.nonce.length < 16) return;
      if (data.version !== LENSFLOW_BRIDGE_VERSION) {
        window.postMessage({
          type: "LENSFLOW_BRIDGE_INCOMPATIBLE",
          nonce: data.nonce,
          expectedVersion: LENSFLOW_BRIDGE_VERSION,
          receivedVersion: data.version,
          extensionVersion: browser.runtime.getManifest().version
        }, event.origin);
        return;
      }
      const channel = new MessageChannel();
      const port = channel.port1;
      ports.add(port);
      port.onmessage = (message) => { void handlePortMessage(port, data.nonce as string, message.data); };
      port.start();
      window.postMessage({ type: CONNECTED, nonce: data.nonce, version: LENSFLOW_BRIDGE_VERSION }, event.origin, [channel.port2]);
    };

    const onRuntimeMessage = (message: { type?: string }) => {
      if (message.type !== "LENSFLOW_CHANGED") return;
      for (const port of ports) port.postMessage({ type: "event", event: "snapshot.changed" });
    };

    window.addEventListener("message", onConnect);
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    ctx.onInvalidated(() => {
      window.removeEventListener("message", onConnect);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      for (const port of ports) port.close();
      ports.clear();
    });
  }
});

async function handlePortMessage(port: MessagePort, nonce: string, raw: unknown): Promise<void> {
  let id: string = crypto.randomUUID();
  try {
    assertBridgePayloadSize(raw);
    const request = bridgeRequestSchema.parse(raw);
    id = request.id;
    if (request.nonce !== nonce) throw new Error("桥接会话 nonce 不匹配。");
    const response = await browser.runtime.sendMessage({ type: "LENSFLOW_BRIDGE_RPC", request }) as RuntimeResponse;
    const payload: BridgeResponse = response.ok
      ? { version: LENSFLOW_BRIDGE_VERSION, id, ok: true, data: response.data }
      : { version: LENSFLOW_BRIDGE_VERSION, id, ok: false, error: response.error };
    port.postMessage(payload);
  } catch (error) {
    port.postMessage({
      version: LENSFLOW_BRIDGE_VERSION,
      id,
      ok: false,
      error: error instanceof Error ? error.message : "桥接请求失败。"
    } satisfies BridgeResponse);
  }
}
