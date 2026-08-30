import { describe, expect, it } from "vitest";
import { DEFAULT_BIYUAN_PROFILE } from "@lensflow/contracts";
import { planLegacyProviderMigration, planLegacySettingsPersistence } from "./legacy-provider-migration";

describe("legacy Provider migration", () => {
  it("moves a persistent visualLensSettings key into the Provider secret plan and scrubs the old field", () => {
    const migration = planLegacyProviderMigration({
      legacy: {
        settingsVersion: 4,
        apiKey: " legacy-local-key ",
        rememberApiKey: true,
        apiBaseUrl: "https://provider.example/v1",
        analysisModel: "vision-model",
        imageModel: "image-model"
      },
      now: "2026-08-30T00:00:00.000Z"
    });

    expect(migration).toMatchObject({
      apiKey: "legacy-local-key",
      profile: {
        kind: "openai-compatible",
        baseUrl: "https://provider.example/v1",
        analysisModel: "vision-model",
        imageModel: "image-model",
        rememberSecret: true
      },
      safeLegacy: { apiKey: "" }
    });
  });

  it("prefers the session key and preserves an existing active Provider", () => {
    const active = { ...DEFAULT_BIYUAN_PROFILE, id: "active", name: "现有 Provider", rememberSecret: false };
    const migration = planLegacyProviderMigration({
      legacy: { apiKey: "local-key", rememberApiKey: true },
      sessionKey: "session-key",
      activeProvider: active
    });

    expect(migration?.apiKey).toBe("session-key");
    expect(migration?.profile).toEqual(active);
    expect(migration?.profile.rememberSecret).toBe(false);
  });

  it("does nothing when no legacy key exists", () => {
    expect(planLegacyProviderMigration({ legacy: { apiKey: "" } })).toBeNull();
  });

  it("never writes a key back to visualLensSettings when the legacy workbench saves", () => {
    const persistent = planLegacySettingsPersistence({
      settings: { apiKey: "updated-key", rememberApiKey: true },
      sessionSecrets: { biyuan: "old-key" }
    });
    expect(persistent.safeSettings.apiKey).toBe("");
    expect(persistent.localSecrets).toEqual({ biyuan: "updated-key" });
    expect(persistent.sessionSecrets).toEqual({});

    const sessionOnly = planLegacySettingsPersistence({
      settings: { apiKey: "session-key", rememberApiKey: false },
      localSecrets: persistent.localSecrets
    });
    expect(sessionOnly.safeSettings.apiKey).toBe("");
    expect(sessionOnly.sessionSecrets).toEqual({ biyuan: "session-key" });
    expect(sessionOnly.localSecrets).toEqual({});
  });
});
