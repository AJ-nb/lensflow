import { describe, expect, it } from "vitest";
import {
  MAX_BRIDGE_PAYLOAD_BYTES,
  assertBridgePayloadSize,
  bridgeRequestSchema,
  isAllowedLensflowBridgeOrigin,
  parseBridgePayload
} from "./bridge";

function request(method: "task.cancel" | "asset.put", payload: unknown) {
  return bridgeRequestSchema.parse({
    version: 1,
    id: "d4f8efb9-dcb8-46f1-a56c-498ff0a29b88",
    nonce: "1234567890abcdef",
    method,
    payload,
    timestamp: Date.now()
  });
}

describe("bridge security contract", () => {
  it("allows only the production path and explicit development origins", () => {
    expect(isAllowedLensflowBridgeOrigin("https://aj-nb.github.io", "/lensflow/studio")).toBe(true);
    expect(isAllowedLensflowBridgeOrigin("https://aj-nb.github.io", "/another-project")).toBe(false);
    expect(isAllowedLensflowBridgeOrigin("http://localhost:4321", "/studio")).toBe(false);
    expect(isAllowedLensflowBridgeOrigin("http://localhost:4321", "/studio", true)).toBe(true);
    expect(isAllowedLensflowBridgeOrigin("https://evil.example", "/lensflow/studio", true)).toBe(false);
  });

  it("validates each method payload instead of accepting arbitrary values", () => {
    expect(parseBridgePayload(request("task.cancel", { batchId: "batch" }))).toEqual({ batchId: "batch" });
    expect(() => parseBridgePayload(request("task.cancel", { id: "batch" }))).toThrow();
    expect(() => parseBridgePayload(request("asset.put", { kind: "capture", name: "x", metadata: { apiKey: "leak" } }))).toThrow("禁止字段");
  });

  it("rejects payloads over the fixed limit", () => {
    expect(() => assertBridgePayloadSize({ value: "x".repeat(MAX_BRIDGE_PAYLOAD_BYTES + 1) })).toThrow("2 MB");
  });
});
