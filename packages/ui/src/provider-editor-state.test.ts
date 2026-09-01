import { describe, expect, it } from "vitest";
import { DEFAULT_BIYUAN_PROFILE, type ModelDescriptor, type ProviderCapabilityProbeResult, type ProviderEditorState } from "@lensflow/contracts";
import {
  defaultProviderCredential,
  probeResultForEditor,
  providerConnectionFingerprint,
  providerCredentialMustBeEntered,
  providerFailureRecovery,
  providerFormFingerprint,
  providerProfileForPreset,
  providerPrimaryAction,
  suggestProviderModels
} from "./provider-editor-state";

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

  it("requires a new key when switching to another remote Provider", () => {
    const compatible = { ...DEFAULT_BIYUAN_PROFILE, kind: "openai-compatible" as const, name: "兼容接口", baseUrl: "https://provider.example/v1" };
    expect(defaultProviderCredential(compatible, "device", "biyuan")).toEqual({ action: "replace", secret: "" });
    expect(defaultProviderCredential(DEFAULT_BIYUAN_PROFILE, "device", "biyuan")).toEqual({ action: "keep" });
  });

  it("suggests models only from unambiguous directional metadata", () => {
    const models: ModelDescriptor[] = [
      { id: "vision-model", modalities: ["text", "image"], raw: { input_modalities: ["text", "image"], output_modalities: ["text"] } },
      { id: "image-model", modalities: ["text", "image"], raw: { input_modalities: ["text"], output_modalities: ["image"] } },
      { id: "mystery-model", modalities: [] }
    ];
    expect(suggestProviderModels(DEFAULT_BIYUAN_PROFILE, models)).toMatchObject({
      analysisModel: "vision-model",
      imageModel: "image-model"
    });
  });

  it("does not guess models from names, flattened modalities, or ambiguous catalogs", () => {
    const unknown: ModelDescriptor[] = [
      { id: "obvious-vision-name", modalities: ["text", "image"] },
      { id: "obvious-image-name", modalities: [] }
    ];
    expect(suggestProviderModels(DEFAULT_BIYUAN_PROFILE, unknown)).toMatchObject({ analysisModel: "", imageModel: "" });

    const ambiguous: ModelDescriptor[] = [
      { id: "vision-a", modalities: ["text", "image"], raw: { input_modalities: ["image"], output_modalities: ["text"] } },
      { id: "vision-b", modalities: ["text", "image"], raw: { input_modalities: ["image"], output_modalities: ["text"] } }
    ];
    expect(suggestProviderModels(DEFAULT_BIYUAN_PROFILE, ambiguous).analysisModel).toBe("");
  });

  it("preserves manual model choices when applying catalog suggestions", () => {
    const configured = { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "manual-analysis", imageModel: "manual-image" };
    const models: ModelDescriptor[] = [
      { id: "vision-model", modalities: ["text", "image"], raw: { input_modalities: ["image"], output_modalities: ["text"] } },
      { id: "image-model", modalities: ["text", "image"], raw: { input_modalities: ["text"], output_modalities: ["image"] } }
    ];
    expect(suggestProviderModels(configured, models)).toMatchObject({ analysisModel: "manual-analysis", imageModel: "manual-image" });
  });

  it("exposes one contextual primary action for connection and activation", () => {
    expect(providerPrimaryAction({ connected: false, readyToConnect: true, hasModel: false, busy: "" })).toEqual({ kind: "connect", label: "连接并配置", disabled: false });
    expect(providerPrimaryAction({ connected: true, readyToConnect: true, hasModel: false, busy: "" })).toEqual({ kind: "activate", label: "启用 Provider", disabled: true });
    expect(providerPrimaryAction({ connected: true, readyToConnect: true, hasModel: true, busy: "activate" })).toEqual({ kind: "activate", label: "正在启用", disabled: true });
  });

  it("routes failure recovery back to the action that actually failed", () => {
    expect(providerFailureRecovery("activate")).toBe("activate");
    expect(providerFailureRecovery("probe")).toBe("confirm-probe");
    expect(providerFailureRecovery("test")).toBe("connect");
    expect(providerFailureRecovery("refresh")).toBe("connect");
    expect(providerFailureRecovery("load")).toBe("load");
  });

  it("requires credential replacement after a Provider rejects authentication", () => {
    expect(providerFailureRecovery("test", "authentication")).toBe("replace-credential");
    expect(providerFailureRecovery("refresh", "authentication")).toBe("replace-credential");
    expect(providerFailureRecovery("activate", "authentication")).toBe("replace-credential");
  });

  it("keeps a replacement key input visible even when a saved credential exists", () => {
    expect(providerCredentialMustBeEntered({ action: "replace", secret: "" })).toBe(true);
    expect(providerCredentialMustBeEntered({ action: "replace", secret: "new-key" })).toBe(true);
    expect(providerCredentialMustBeEntered({ action: "keep" })).toBe(false);
  });

  it("keeps same-preset edits and clears incompatible fields only when switching services", () => {
    const edited = { ...DEFAULT_BIYUAN_PROFILE, name: "我的彼源", analysisModel: "manual-analysis", credentialRef: "credential-ref" };
    expect(providerProfileForPreset(edited, "biyuan")).toBe(edited);
    expect(providerProfileForPreset(edited, "openai-compatible")).toMatchObject({
      kind: "openai-compatible",
      name: "兼容接口",
      baseUrl: "",
      analysisModel: "",
      imageModel: "",
      credentialRef: "credential-ref"
    });
  });

  it("does not apply the active probe result to an unactivated draft", () => {
    const activeProbeResult: ProviderCapabilityProbeResult = {
      capabilities: {
        authentication: "supported",
        visionInput: "error",
        structuredOutputs: "supported",
        imageGeneration: "unknown",
        imageEditing: "unknown",
        backgroundTasks: "unknown",
        cancellation: "unsupported"
      },
      failures: {
        visionInput: {
          category: "invalid-response",
          retryable: false,
          summary: "图像输入探测失败",
          guidance: "请检查模型。"
        }
      }
    };
    const state: ProviderEditorState = {
      active: DEFAULT_BIYUAN_PROFILE,
      draft: { ...DEFAULT_BIYUAN_PROFILE, name: "草稿" },
      activeProbeResult,
      activeCredentialState: "missing",
      draftCredentialState: "missing"
    };
    expect(probeResultForEditor(state)).toBeNull();
    expect(probeResultForEditor({ ...state, draft: null })).toEqual(activeProbeResult);
  });
});
