import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { LensflowDatabase } from "./database";

describe("Lensflow database v2 migration", () => {
  it("preserves v1 analysis rows and adds lifecycle/provenance fields", async () => {
    const name = `lensflow-v1-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      captures: "id, createdAt, sha256, pageUrl",
      analyses: "id, captureId, createdAt, model",
      prompts: "id, kind, axis, createdAt, updatedAt",
      references: "id, kind, createdAt, enabled",
      generationJobs: "id, state, providerId, createdAt, updatedAt",
      assets: "id, kind, sourceTaskId, createdAt, updatedAt",
      collections: "id, createdAt, updatedAt",
      historyEvents: "id, type, entityId, createdAt",
      settingsMeta: "key, updatedAt"
    });
    await legacy.table("analyses").add({ id: "old", captureId: "capture-1", model: "vision", result: { title: "legacy" }, createdAt: "2026-08-29T00:00:00.000Z" });
    legacy.close();

    const migrated = new LensflowDatabase(name);
    const row = await migrated.analyses.get("old");
    expect(row).toMatchObject({ assetId: "capture-1", captureId: "capture-1", mode: "quick", state: "ready", providerId: "legacy", updatedAt: "2026-08-29T00:00:00.000Z" });
    await migrated.delete();
  });
});

describe("Lensflow database v3 migration", () => {
  it("removes legacy HTML from analyses, generation jobs, and history", async () => {
    const name = `lensflow-v2-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(2).stores({
      captures: "id, createdAt, sha256, pageUrl",
      analyses: "id, assetId, captureId, state, mode, providerId, updatedAt",
      prompts: "id, kind, axis, sourceAssetId, sourceAnalysisId, variantKind, createdAt, updatedAt",
      references: "id, kind, createdAt, enabled",
      generationJobs: "id, state, providerId, createdAt, updatedAt",
      assets: "id, kind, sourceTaskId, createdAt, updatedAt",
      collections: "id, createdAt, updatedAt",
      historyEvents: "id, type, entityId, createdAt",
      settingsMeta: "key, updatedAt"
    });
    const now = "2026-08-29T00:00:00.000Z";
    const html = "Provider 请求失败 (502)：<!DOCTYPE html><html><body>Bad gateway</body></html>";
    await legacy.table("analyses").add({ id: "analysis", assetId: "asset", mode: "quick", state: "failed", providerId: "biyuan", model: "analysis", error: html, createdAt: now, updatedAt: now });
    await legacy.table("generationJobs").add({ id: "batch", providerId: "biyuan", prompt: "test", settings: { model: "image", size: "1024x1024", quality: "medium", count: 1, concurrency: 1 }, referenceIds: [], state: "failed", children: [{ id: "child", batchId: "batch", index: 0, state: "failed", error: html, attempt: 0, updatedAt: now }], createdAt: now, updatedAt: now });
    await legacy.table("historyEvents").add({ id: "event", type: "analysis.failed", message: html, createdAt: now });
    legacy.close();

    const migrated = new LensflowDatabase(name);
    const analysis = await migrated.analyses.get("analysis");
    const batch = await migrated.generationJobs.get("batch");
    const event = await migrated.historyEvents.get("event");
    expect(analysis?.failure).toMatchObject({ category: "upstream", status: 502 });
    expect(analysis?.error).toBe("Provider 暂时不可用");
    expect(batch?.children[0]?.error).toBe("Provider 暂时不可用");
    expect(event?.message).toBe("Provider 暂时不可用");
    expect(JSON.stringify({ analysis, batch, event })).not.toContain("<!DOCTYPE");
    await migrated.delete();
  });
});
