import { DEFAULT_BIYUAN_PROFILE, type ModelDescriptor, type OperationFailure, type ProviderCredentialMutation, type ProviderCredentialState, type ProviderEditorState, type ProviderProfile, type ProviderCapabilityProbeResult } from "@lensflow/contracts";
import { normalizeBaseUrl } from "@lensflow/core";

export function defaultProviderCredential(profile: ProviderProfile, state: ProviderCredentialState, previousKind?: ProviderProfile["kind"]): ProviderCredentialMutation {
  if (profile.kind === "comfyui") return { action: "clear" };
  if (previousKind && previousKind !== profile.kind) return { action: "replace", secret: "" };
  return state === "missing" ? { action: "replace", secret: "" } : { action: "keep" };
}

export function suggestProviderModels(profile: ProviderProfile, models: ModelDescriptor[]): ProviderProfile {
  const analysisCandidates = models.filter((model) => hasDirectionalModalities(model, "image", "text"));
  const imageCandidates = profile.kind === "comfyui"
    ? models.filter((model) => model.modalities.includes("image"))
    : models.filter((model) => hasOutputModality(model, "image"));
  return {
    ...profile,
    analysisModel: profile.analysisModel || (analysisCandidates.length === 1 ? analysisCandidates[0]!.id : ""),
    imageModel: profile.imageModel || (imageCandidates.length === 1 ? imageCandidates[0]!.id : "")
  };
}

export function providerPrimaryAction(input: { connected: boolean; readyToConnect: boolean; hasModel: boolean; busy: string }) {
  if (!input.connected) {
    return {
      kind: "connect" as const,
      label: input.busy === "test" || input.busy === "refresh" ? "正在连接" : "连接并配置",
      disabled: Boolean(input.busy) || !input.readyToConnect
    };
  }
  return {
    kind: "activate" as const,
    label: input.busy === "activate" ? "正在启用" : "启用 Provider",
    disabled: Boolean(input.busy) || !input.hasModel
  };
}

export function providerFailureRecovery(action: string, category?: OperationFailure["category"]): "activate" | "confirm-probe" | "connect" | "load" | "replace-credential" | "save-draft" | null {
  if (category === "authentication" && ["activate", "probe", "refresh", "test"].includes(action)) return "replace-credential";
  if (action === "activate") return "activate";
  if (action === "probe") return "confirm-probe";
  if (action === "test" || action === "refresh") return "connect";
  if (action === "load") return "load";
  if (action === "draft") return "save-draft";
  return null;
}

export function providerCredentialMustBeEntered(credential: ProviderCredentialMutation): boolean {
  return credential.action === "replace";
}

export function providerProfileForPreset(current: ProviderProfile, kind: ProviderProfile["kind"]): ProviderProfile {
  if (current.kind === kind) return current;
  const updatedAt = new Date().toISOString();
  if (kind === "biyuan") return {
    ...DEFAULT_BIYUAN_PROFILE,
    credentialRef: current.credentialRef,
    createdAt: current.createdAt,
    updatedAt
  };
  if (kind === "openai-compatible") return {
    ...current,
    kind,
    name: "兼容接口",
    baseUrl: "",
    protocolMode: "responses",
    analysisModel: "",
    imageModel: "",
    comfyWorkflow: undefined,
    updatedAt
  };
  return {
    ...current,
    kind,
    name: "ComfyUI",
    baseUrl: "http://127.0.0.1:8188",
    protocolMode: "comfyui",
    analysisModel: "",
    imageModel: "",
    comfyWorkflow: undefined,
    updatedAt
  };
}

export function providerConnectionFingerprint(profile: ProviderProfile, credential: ProviderCredentialMutation): string {
  let baseUrl = profile.baseUrl;
  try { baseUrl = normalizeBaseUrl(baseUrl); } catch { /* Keep invalid input distinct. */ }
  return JSON.stringify([profile.kind, baseUrl, profile.protocolMode, profile.rememberSecret, credential.action, credential.action === "replace" ? credential.secret : ""]);
}

export function providerFormFingerprint(profile: ProviderProfile, credential: ProviderCredentialMutation): string {
  return JSON.stringify([profile.name, profile.kind, profile.baseUrl, profile.protocolMode, profile.analysisModel, profile.imageModel, profile.rememberSecret, profile.comfyWorkflow, credential.action, credential.action === "replace" ? credential.secret : ""]);
}

export function providerCredentialStateLabel(state: ProviderCredentialState) {
  if (state === "device") return "已有密钥保存在本设备，内容不会显示";
  if (state === "session") return "已有密钥只保留到浏览器关闭";
  return "尚未保存密钥";
}

export function probeResultForEditor(state: ProviderEditorState): ProviderCapabilityProbeResult | null {
  return state.draft ? null : state.activeProbeResult;
}

function hasDirectionalModalities(model: ModelDescriptor, input: ModelDescriptor["modalities"][number], output: ModelDescriptor["modalities"][number]): boolean {
  return rawModalities(model.raw?.input_modalities).includes(input) && rawModalities(model.raw?.output_modalities).includes(output);
}

function hasOutputModality(model: ModelDescriptor, output: ModelDescriptor["modalities"][number]): boolean {
  return rawModalities(model.raw?.output_modalities).includes(output);
}

function rawModalities(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
  return typeof value === "string" ? [value.toLowerCase()] : [];
}
