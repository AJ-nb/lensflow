import type { ProviderCredentialMutation, ProviderCredentialState, ProviderProfile } from "@lensflow/contracts";
import { normalizeBaseUrl } from "@lensflow/core";

export function defaultProviderCredential(profile: ProviderProfile, state: ProviderCredentialState): ProviderCredentialMutation {
  if (profile.kind === "comfyui") return { action: "clear" };
  return state === "missing" ? { action: "replace", secret: "" } : { action: "keep" };
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
