import { describe, expect, it } from "vitest";
import { DEFAULT_BIYUAN_PROFILE } from "@lensflow/contracts";
import { defaultProviderCredential, providerConnectionFingerprint, providerFormFingerprint } from "./provider-editor-state";

describe("Provider editor state", () => {
  it("keeps connection verification when only the display name or model changes", () => {
    const credential = { action: "keep" as const };
    const baseline = providerConnectionFingerprint(DEFAULT_BIYUAN_PROFILE, credential);
    expect(providerConnectionFingerprint({ ...DEFAULT_BIYUAN_PROFILE, name: "新名称" }, credential)).toBe(baseline);
    expect(providerConnectionFingerprint({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis" }, credential)).toBe(baseline);
    expect(providerFormFingerprint({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis" }, credential)).not.toBe(providerFormFingerprint(DEFAULT_BIYUAN_PROFILE, credential));
  });

  it("invalidates verification for URL, protocol, persistence, or secret changes", () => {
    const baseline = providerConnectionFingerprint(DEFAULT_BIYUAN_PROFILE, { action: "keep" });
    expect(providerConnectionFingerprint({ ...DEFAULT_BIYUAN_PROFILE, baseUrl: "https://other.example/v1" }, { action: "keep" })).not.toBe(baseline);
    expect(providerConnectionFingerprint({ ...DEFAULT_BIYUAN_PROFILE, protocolMode: "chat-completions" }, { action: "keep" })).not.toBe(baseline);
    expect(providerConnectionFingerprint({ ...DEFAULT_BIYUAN_PROFILE, rememberSecret: true }, { action: "keep" })).not.toBe(baseline);
    expect(providerConnectionFingerprint(DEFAULT_BIYUAN_PROFILE, { action: "replace", secret: "new" })).not.toBe(baseline);
  });

  it("uses explicit key states instead of treating an empty field as deletion", () => {
    expect(defaultProviderCredential(DEFAULT_BIYUAN_PROFILE, "device")).toEqual({ action: "keep" });
    expect(defaultProviderCredential(DEFAULT_BIYUAN_PROFILE, "missing")).toEqual({ action: "replace", secret: "" });
    expect(defaultProviderCredential({ ...DEFAULT_BIYUAN_PROFILE, kind: "comfyui", protocolMode: "comfyui" }, "missing")).toEqual({ action: "clear" });
  });
});
