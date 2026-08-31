import { describe, expect, it } from "vitest";
import {
  LENSFLOW_BRIDGE_READ_METHODS,
  LENSFLOW_BRIDGE_WRITE_METHODS,
  MAX_BRIDGE_PAYLOAD_BYTES,
  assertBridgePayloadSize,
  bridgeMethodSchema,
  bridgeRequestSchema,
  isBridgeWriteMethod,
  isAllowedLensflowBridgeOrigin,
  parseBridgePayload,
  type BridgeMethod
} from "./bridge";

function request(method: BridgeMethod, payload: unknown) {
  return bridgeRequestSchema.parse({
    version: 2,
    id: "d4f8efb9-dcb8-46f1-a56c-498ff0a29b88",
    nonce: "1234567890abcdef",
    method,
    payload,
    timestamp: Date.now()
  });
}

describe("bridge security contract", () => {
  it("classifies every bridge method as read or write exactly once", () => {
    const reads = new Set<BridgeMethod>(LENSFLOW_BRIDGE_READ_METHODS);
    const writes = new Set<BridgeMethod>(LENSFLOW_BRIDGE_WRITE_METHODS);
    expect(bridgeMethodSchema.options).toHaveLength(reads.size + writes.size);
    for (const method of bridgeMethodSchema.options) {
      expect(Number(reads.has(method)) + Number(writes.has(method))).toBe(1);
      expect(isBridgeWriteMethod(method)).toBe(writes.has(method));
    }
  });

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

  it("allows only strict Provider and analysis navigation payloads", () => {
    expect(parseBridgePayload(request("provider.open", undefined))).toBeUndefined();
    expect(parseBridgePayload(request("analysis.open", { assetId: "asset-1" }))).toEqual({ assetId: "asset-1" });
    expect(() => parseBridgePayload(request("provider.open", { apiKey: "secret" }))).toThrow();
    expect(() => parseBridgePayload(request("analysis.open", { assetId: "asset-1", url: "https://example.com" }))).toThrow();
    expect(() => parseBridgePayload(request("analysis.open", { assetId: "asset-1", filePath: "C:/secret.png" }))).toThrow();
  });

  it("validates v2 analysis, prompt and Eagle methods without URL or secret fields", () => {
    expect(parseBridgePayload(request("analysis.create", { assetId: "asset-1", mode: "quick" }))).toEqual({ assetId: "asset-1", mode: "quick" });
    expect(parseBridgePayload(request("analysis.get", { analysisId: "analysis-1" }))).toEqual({ analysisId: "analysis-1" });
    expect(parseBridgePayload(request("eagle.export", { batchId: "batch-1", childIds: ["child-1"] }))).toEqual({ batchId: "batch-1", childIds: ["child-1"] });
    expect(() => parseBridgePayload(request("analysis.create", { assetId: "asset-1", mode: "fast" }))).toThrow();
    expect(() => parseBridgePayload(request("analysis.create", { assetId: "asset-1", mode: "quick", url: "https://example.com" }))).toThrow();
    expect(() => parseBridgePayload(request("prompt.save", { text: "x", negativeText: "", language: "zh", token: "secret" }))).toThrow("禁止字段");
  });
});
