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
