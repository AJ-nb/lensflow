import { describe, expect, it } from "vitest";
import type { BridgeRequest } from "@lensflow/contracts";
import { BridgeReplayGuard } from "./bridge-security";

const base: BridgeRequest = {
  version: 1,
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
});
