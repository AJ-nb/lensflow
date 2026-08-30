import {
  DEFAULT_BIYUAN_PROFILE,
  providerProfileSchema,
  type ProviderProfile
} from "@lensflow/contracts";

export interface LegacyProviderSettings {
  apiKey?: unknown;
  rememberApiKey?: unknown;
  apiBaseUrl?: unknown;
  analysisModel?: unknown;
  imageModel?: unknown;
  [key: string]: unknown;
}

export interface LegacyProviderMigration {
  apiKey: string;
  profile: ProviderProfile;
  safeLegacy: LegacyProviderSettings;
}

export function planLegacySettingsPersistence<T extends { apiKey?: unknown; rememberApiKey?: unknown }>(input: {
  settings: T;
  sessionSecrets?: Record<string, string>;
  localSecrets?: Record<string, string>;
}): {
  safeSettings: T;
  sessionSecrets: Record<string, string>;
  localSecrets: Record<string, string>;
} {
  const sessionSecrets = { ...(input.sessionSecrets ?? {}) };
  const localSecrets = { ...(input.localSecrets ?? {}) };
  const apiKey = typeof input.settings.apiKey === "string" ? input.settings.apiKey.trim() : "";
  const matchingId = [...Object.entries(sessionSecrets), ...Object.entries(localSecrets)]
    .find(([, value]) => value === apiKey)?.[0];
  const providerId = matchingId ?? Object.keys(sessionSecrets)[0] ?? Object.keys(localSecrets)[0] ?? DEFAULT_BIYUAN_PROFILE.id;

  if (apiKey) {
    if (input.settings.rememberApiKey === true) {
      localSecrets[providerId] = apiKey;
      delete sessionSecrets[providerId];
    } else {
      sessionSecrets[providerId] = apiKey;
      delete localSecrets[providerId];
    }
  } else {
    delete sessionSecrets[providerId];
    delete localSecrets[providerId];
  }

  return {
    safeSettings: { ...input.settings, apiKey: "" },
    sessionSecrets,
    localSecrets
  };
}

export function planLegacyProviderMigration(input: {
  legacy?: LegacyProviderSettings;
  sessionKey?: unknown;
  activeProvider?: unknown;
  now?: string;
}): LegacyProviderMigration | null {
  const legacy = input.legacy ?? {};
  const sessionKey = typeof input.sessionKey === "string" ? input.sessionKey.trim() : "";
  const localKey = typeof legacy.apiKey === "string" ? legacy.apiKey.trim() : "";
  const apiKey = sessionKey || localKey;
  if (!apiKey) return null;

  const current = providerProfileSchema.safeParse(input.activeProvider);
  const now = input.now ?? new Date().toISOString();
  const requestedBaseUrl = typeof legacy.apiBaseUrl === "string" ? legacy.apiBaseUrl.trim() : "";
  const baseUrl = isHttpUrl(requestedBaseUrl) ? requestedBaseUrl : DEFAULT_BIYUAN_PROFILE.baseUrl;
  const profile = current.success ? current.data : providerProfileSchema.parse({
    ...DEFAULT_BIYUAN_PROFILE,
    baseUrl,
    kind: baseUrl.includes("api.biyuan.ai") ? "biyuan" : "openai-compatible",
    name: baseUrl.includes("api.biyuan.ai") ? "彼源" : "迁移的兼容接口",
    analysisModel: typeof legacy.analysisModel === "string" ? legacy.analysisModel.trim() : "",
    imageModel: typeof legacy.imageModel === "string" ? legacy.imageModel.trim() : "",
    rememberSecret: legacy.rememberApiKey === true,
    createdAt: now,
    updatedAt: now
  });

  return {
    apiKey,
    profile,
    safeLegacy: { ...legacy, apiKey: "" }
  };
}

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}
