import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BIYUAN_PROFILE } from "@lensflow/contracts";
import { BiyuanAdapter, MODEL_CATALOG_CACHE_TTL_MS, OpenAICompatibleAdapter, ProviderHttpError, comfyWebSocketUrl, extractModelModalities, isModelCatalogCacheFresh } from "./providers";

afterEach(() => vi.restoreAllMocks());

describe("provider adapters", () => {
  it("accepts model catalogs only inside the 24 hour cache window", () => {
    const now = Date.parse("2026-08-29T00:00:00.000Z");
    const cache = { cachedAt: now, expiresAt: now + MODEL_CATALOG_CACHE_TTL_MS, models: [] };
    expect(isModelCatalogCacheFresh(cache, now + MODEL_CATALOG_CACHE_TTL_MS - 1)).toBe(true);
    expect(isModelCatalogCacheFresh(cache, now + MODEL_CATALOG_CACHE_TTL_MS)).toBe(false);
  });
  it("classifies only explicit model metadata and leaves missing metadata unknown", () => {
    expect(extractModelModalities({ input_modalities: ["text", "image"], output_modalities: ["text"] })).toEqual(["text", "image"]);
    expect(extractModelModalities({ id: "gpt-image-looking-name" })).toEqual([]);
  });

  it("derives the native ComfyUI WebSocket endpoint", () => {
    expect(comfyWebSocketUrl("http://127.0.0.1:8188", "client id")).toBe("ws://127.0.0.1:8188/ws?clientId=client+id");
  });

  it("discovers models from the authenticated catalog without hardcoding names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "allowed-model", owned_by: "provider" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
    const models = await new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "key");
    expect(models.map((item) => item.id)).toEqual(["allowed-model"]);
    expect(fetch).toHaveBeenCalledWith("https://api.biyuan.ai/v1/models", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer key" }) }));
  });

  it("surfaces 401 without retrying", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", mocked);
    await expect(new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "bad")).rejects.toBeInstanceOf(ProviderHttpError);
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("uses the documented Biyuan async endpoint and reports no cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { task_id: "t1", status: "queued" } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
    const adapter = new BiyuanAdapter();
    const result = await adapter.generate(DEFAULT_BIYUAN_PROFILE, "key", {
      model: "image-model",
      prompt: "test",
      size: "1024x1024",
      quality: "medium",
      count: 1,
      async: true
    });
    expect(result.remoteId).toBe("t1");
    expect(fetch).toHaveBeenCalledWith("https://api.biyuan.ai/v1/images/generations/async", expect.anything());
    await expect(adapter.cancel(DEFAULT_BIYUAN_PROFILE, "key", "t1")).resolves.toBe(false);
  });

  it("runs each requested capability probe once without automatic retry", async () => {
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    const mocked = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "analysis", modalities: ["text", "image"] }, { id: "image", modalities: ["image"] }] }))
      .mockResolvedValueOnce(json({ output_text: "OK" }))
      .mockResolvedValueOnce(json({ output_text: "{\"ok\":true}" }))
      .mockResolvedValueOnce(json({ data: { task_id: "generation", status: "queued" } }))
      .mockResolvedValueOnce(json({ data: { task_id: "edit", status: "queued" } }));
    vi.stubGlobal("fetch", mocked);
    const adapter = new BiyuanAdapter();
    const result = await adapter.probeCapabilities({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis", imageModel: "image" }, "key");
    expect(result).toMatchObject({ authentication: "supported", visionInput: "supported", structuredOutputs: "supported", imageGeneration: "supported", imageEditing: "supported", backgroundTasks: "supported" });
    expect(mocked).toHaveBeenCalledTimes(5);
  });
});
