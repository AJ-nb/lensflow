import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BIYUAN_PROFILE } from "@lensflow/contracts";
import { BiyuanAdapter, MODEL_CATALOG_CACHE_TTL_MS, OpenAICompatibleAdapter, ProviderHttpError, comfyWebSocketUrl, extractModelModalities, isModelCatalogCacheFresh } from "./providers";
import { toOperationFailure } from "./operation-failure";

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

  it("normalizes an HTML 502 without exposing markup or credentials", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(`<!DOCTYPE html><html><body><h1>Bad gateway</h1><p>Authorization: Bearer sk-private-token</p></body></html>`, {
      status: 502,
      headers: { "content-type": "text/html", "cf-ray": "ray-502" }
    }));
    vi.stubGlobal("fetch", mocked);
    const error = await new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "bad").catch((reason) => reason) as ProviderHttpError;
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect(error.failure).toMatchObject({ category: "upstream", status: 502, retryable: true, summary: "彼源暂时不可用", requestId: "ray-502" });
    expect(error.message).not.toContain("DOCTYPE");
    expect(error.failure.technicalDetails).not.toContain("<html");
    expect(error.failure.technicalDetails).not.toContain("sk-private-token");
  });

  it("keeps HTTP semantics when an error claims JSON but contains invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream unavailable {", {
      status: 503,
      headers: { "content-type": "application/json" }
    })));
    const error = await new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "key").catch((reason) => reason) as ProviderHttpError;
    expect(error.failure).toMatchObject({ category: "upstream", status: 503, retryable: true });
  });

  it("classifies invalid JSON on a successful response as an invalid response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
    const error = await new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "key").catch((reason) => reason) as ProviderHttpError;
    expect(error.failure).toMatchObject({ category: "invalid-response", status: 200, retryable: false });
  });

  it("classifies rate limits separately and never retries automatically", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Too many requests" } }), {
      status: 429,
      headers: { "content-type": "application/json", "x-request-id": "request-429" }
    }));
    vi.stubGlobal("fetch", mocked);
    const error = await new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "key").catch((reason) => reason) as ProviderHttpError;
    expect(error.failure).toMatchObject({ category: "rate-limit", status: 429, retryable: true, requestId: "request-429" });
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("classifies a fetch rejection as a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await new OpenAICompatibleAdapter().listModels(DEFAULT_BIYUAN_PROFILE, "key").catch((reason) => reason);
    expect(toOperationFailure(error, "彼源")).toMatchObject({ category: "network", retryable: true, summary: "无法连接 彼源" });
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
    expect(result.capabilities).toMatchObject({ authentication: "supported", visionInput: "supported", structuredOutputs: "supported", imageGeneration: "supported", imageEditing: "supported", backgroundTasks: "supported" });
    expect(result.failures).toEqual({});
    expect(mocked).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["plain text", "OK"],
    ["a non-boolean ok value", '{"ok":"yes"}'],
    ["a missing ok field", '{"result":true}']
  ])("marks structured outputs as an error when the probe returns %s", async (_case, outputText) => {
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "analysis" }] }))
      .mockResolvedValueOnce(json({ output_text: "OK" }))
      .mockResolvedValueOnce(json({ output_text: outputText })));

    const result = await new BiyuanAdapter().probeCapabilities({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis", imageModel: "" }, "key");

    expect(result.capabilities.structuredOutputs).toBe("error");
    expect(result.failures.structuredOutputs).toMatchObject({
      category: "unknown",
      retryable: false,
      technicalDetails: expect.stringContaining("ok")
    });
  });

  it("keeps an endpoint 404 as unsupported without a failure record", async () => {
    const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...init.headers }
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "analysis" }] }))
      .mockResolvedValueOnce(json({ error: { message: "not found" } }, { status: 404 }))
      .mockResolvedValueOnce(json({ output_text: '{"ok":true}' })));

    const result = await new BiyuanAdapter().probeCapabilities({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis", imageModel: "" }, "key");

    expect(result.capabilities.visionInput).toBe("unsupported");
    expect(result.failures.visionInput).toBeUndefined();
  });

  it("treats a model catalog 404 as a configuration error with a failure record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "not found" } }), {
      status: 404,
      headers: { "content-type": "application/json" }
    })));

    const result = await new BiyuanAdapter().probeCapabilities({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis" }, "key");

    expect(result.capabilities.authentication).toBe("error");
    expect(result.failures.authentication).toMatchObject({ category: "configuration", status: 404, retryable: false });
  });

  it("rejects structured probe objects with extra fields", async () => {
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "analysis" }] }))
      .mockResolvedValueOnce(json({ output_text: "OK" }))
      .mockResolvedValueOnce(json({ output_text: '{"ok":true,"extra":1}' })));

    const result = await new BiyuanAdapter().probeCapabilities({ ...DEFAULT_BIYUAN_PROFILE, analysisModel: "analysis" }, "key");

    expect(result.capabilities.structuredOutputs).toBe("error");
    expect(result.failures.structuredOutputs).toMatchObject({ category: "unknown", retryable: false });
  });

  it("keeps probe failure details and leaves untested Biyuan capabilities unknown", async () => {
    const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...init.headers }
    });
    const mocked = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "gpt-5.6-sol" }] }))
      .mockResolvedValueOnce(json({ error: { message: "image input is unavailable for this model" } }, { status: 400, headers: { "x-request-id": "vision-probe-400" } }))
      .mockResolvedValueOnce(json({ output_text: "{\"ok\":true}" }));
    vi.stubGlobal("fetch", mocked);

    const result = await new BiyuanAdapter().probeCapabilities({
      ...DEFAULT_BIYUAN_PROFILE,
      analysisModel: "gpt-5.6-sol",
      imageModel: ""
    }, "key");

    expect(result.capabilities).toEqual({
      authentication: "supported",
      visionInput: "error",
      structuredOutputs: "supported",
      imageGeneration: "unknown",
      imageEditing: "unknown",
      backgroundTasks: "unknown",
      cancellation: "unsupported"
    });
    expect(result.failures.visionInput).toMatchObject({
      category: "invalid-response",
      status: 400,
      requestId: "vision-probe-400",
      retryable: false
    });
    expect(result.failures.visionInput?.technicalDetails).toContain("image input is unavailable");
    expect(mocked).toHaveBeenCalledTimes(3);
  });
});
