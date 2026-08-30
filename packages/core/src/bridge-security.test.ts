import { describe, expect, it } from "vitest";
import type { AnalysisRecord, BridgeRequest } from "@lensflow/contracts";
import { analysisRecordForBridge, BridgeReplayGuard } from "./bridge-security";

const base: BridgeRequest = {
  version: 2,
  id: "d4f8efb9-dcb8-46f1-a56c-498ff0a29b88",
  nonce: "1234567890abcdef",
  method: "snapshot.get",
  timestamp: 1_000
};

describe("bridge replay guard", () => {
  it("rejects replayed and expired requests", () => {
    const guard = new BridgeReplayGuard(100, 500);
    guard.assertFresh(base, 1_050);
    expect(() => guard.assertFresh(base, 1_060)).toThrow("重复");
    expect(() => guard.assertFresh({ ...base, id: "f13fddc5-b0f6-4081-9479-11ac24d5863e", timestamp: 800 }, 1_050)).toThrow("过期");
  });

  it("removes raw Provider responses from analysis records before bridge transport", () => {
    const record: AnalysisRecord = {
      id: "analysis-1",
      assetId: "asset-1",
      mode: "quick",
      state: "failed",
      providerId: "provider-1",
      model: "vision-model",
      rawResponse: { authorization: "must-not-cross", providerPayload: { id: "remote-1" } },
      error: "schema failed",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z"
    };

    expect(analysisRecordForBridge(record)).not.toHaveProperty("rawResponse");
    expect(JSON.stringify(analysisRecordForBridge(record))).not.toContain("must-not-cross");
  });
});
