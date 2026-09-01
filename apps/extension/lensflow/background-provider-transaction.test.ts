import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_BIYUAN_PROFILE, type ProviderEditorState } from "@lensflow/contracts";
import { LensflowDatabase } from "@lensflow/core";
import { STORAGE_KEYS } from "../shared/storage";

class MemoryStorageArea {
  readonly values: Record<string, unknown> = {};

  async get(keys?: string | string[]): Promise<Record<string, unknown>> {
    if (keys === undefined) return { ...this.values };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.map((key) => [key, this.values[key]]));
  }

  async set(values: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, values);
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.values[key];
  }
}

describe("Provider candidate transaction", () => {
  const local = new MemoryStorageArea();
  const session = new MemoryStorageArea();

  beforeAll(async () => {
    const stale = new LensflowDatabase();
    await stale.delete();
    vi.stubGlobal("browser", {
      storage: { local, session },
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) }
    });
  });

  it("keeps the active profile and secret through a failed test, then swaps only after activation", async () => {
    const { handleLensflowRequest } = await import("./background-service");
    const active = { ...DEFAULT_BIYUAN_PROFILE, analysisModel: "old-analysis", rememberSecret: true };
    const seed = new LensflowDatabase();
    await seed.settingsMeta.put({ key: "activeProvider", value: active, updatedAt: new Date().toISOString() });
    seed.close();
    await local.set({ [STORAGE_KEYS.providerSecrets]: { [active.id]: "old-secret" } });

    const candidate = {
      profile: { ...active, name: "候选 Provider", baseUrl: "https://candidate.example/v1", analysisModel: "analysis", updatedAt: new Date().toISOString() },
      credential: { action: "replace" as const, secret: "new-secret" }
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<!doctype html><h1>Bad gateway</h1>", { status: 502, headers: { "content-type": "text/html" } })));
    await expect(handleLensflowRequest({ type: "LENSFLOW_TEST_PROVIDER_CANDIDATE", candidate })).rejects.toMatchObject({ status: 502 });

    let state = await handleLensflowRequest({ type: "LENSFLOW_PROVIDER_EDITOR_STATE" }) as ProviderEditorState;
    expect(state.active?.baseUrl).toBe(DEFAULT_BIYUAN_PROFILE.baseUrl);
    expect(state.draft).toBeNull();
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[active.id]).toBe("old-secret");
    expect(JSON.stringify(local.values)).not.toContain("new-secret");

    state = await handleLensflowRequest({ type: "LENSFLOW_SAVE_PROVIDER_DRAFT", candidate }) as ProviderEditorState;
    expect(state.active?.baseUrl).toBe(DEFAULT_BIYUAN_PROFILE.baseUrl);
    expect(state.draft?.baseUrl).toBe("https://candidate.example/v1");
    expect(state.draftCredentialState).toBe("device");
    const draftRef = state.draft!.credentialRef!;
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[active.id]).toBe("old-secret");
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[draftRef]).toBe("new-secret");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<!doctype html><h1>Bad gateway</h1>", { status: 502, headers: { "content-type": "text/html" } })));
    await expect(handleLensflowRequest({ type: "LENSFLOW_ACTIVATE_PROVIDER_CANDIDATE", candidate: { profile: state.draft!, credential: { action: "keep" } } })).rejects.toMatchObject({ status: 502 });
    state = await handleLensflowRequest({ type: "LENSFLOW_PROVIDER_EDITOR_STATE" }) as ProviderEditorState;
    expect(state.active?.baseUrl).toBe(DEFAULT_BIYUAN_PROFILE.baseUrl);
    expect(state.draft?.baseUrl).toBe("https://candidate.example/v1");
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[active.id]).toBe("old-secret");
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[draftRef]).toBe("new-secret");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "analysis", modalities: ["text", "image"] }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const activated = await handleLensflowRequest({ type: "LENSFLOW_ACTIVATE_PROVIDER_CANDIDATE", candidate: { profile: state.draft!, credential: { action: "keep" } } }) as typeof active;
    state = await handleLensflowRequest({ type: "LENSFLOW_PROVIDER_EDITOR_STATE" }) as ProviderEditorState;
    expect(state.active?.name).toBe("候选 Provider");
    expect(state.draft).toBeNull();
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[active.id]).toBeUndefined();
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[draftRef]).toBeUndefined();
    expect((local.values[STORAGE_KEYS.providerSecrets] as Record<string, string>)[activated.credentialRef!]).toBe("new-secret");
  });
});
