import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { LensflowDatabase } from "./database";
import {
  createDiagnosticExport,
  createLensflowBackup,
  importLensflowBackup,
  loadMaintenanceSummary,
  pruneHistory,
  redactSensitive,
  setHistoryRetention
} from "./data-management";

const databases: LensflowDatabase[] = [];
function database() {
  const db = new LensflowDatabase(`lensflow-test-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("local backup and diagnostics", () => {
  it("redacts secret fields recursively", () => {
    expect(redactSensitive({ apiKey: "a", nested: { token: "b", keep: true }, values: [{ secret: "c", id: 1 }] }))
      .toEqual({ nested: { keep: true }, values: [{ id: 1 }] });
  });

  it("exports all nine tables without provider secrets", async () => {
    const db = database();
    await db.settingsMeta.bulkPut([
      { key: "activeProvider", value: { id: "p", name: "Provider", apiKey: "secret", rememberSecret: true }, updatedAt: "2026-08-29T00:00:00.000Z" },
      { key: "providerSecrets", value: { p: "secret" }, updatedAt: "2026-08-29T00:00:00.000Z" }
    ]);
    const output = await createLensflowBackup(db, "0.1.0", "2026-08-29T00:00:00.000Z");
    const parsed = JSON.parse(output.text);
    expect(Object.keys(parsed.tables)).toHaveLength(9);
    expect(output.text).not.toContain("secret");
    expect(parsed.tables.settingsMeta).toHaveLength(1);
  });

  it("imports legacy archives while discarding API keys", async () => {
    const db = database();
    const summary = await importLensflowBackup(db, {
      format: "visual-lens-backup",
      schemaVersion: 1,
      settings: { apiKey: "secret", rememberApiKey: true, apiBaseUrl: "https://example.com/v1" },
      analyses: [{ id: "a1", sha256: "hash", model: "vision", result: { ok: true }, generatedAt: "2026-08-29T00:00:00.000Z" }],
      promptVersions: [{ id: "p1", positivePrompt: "prompt", createdAt: "2026-08-29T00:00:00.000Z" }]
    }, "merge");
    expect(summary.discardedSecrets).toBe(true);
    expect(await db.analyses.count()).toBe(1);
    expect(await db.prompts.count()).toBe(1);
    expect(JSON.stringify(await db.settingsMeta.toArray())).not.toContain("secret");
  });

  it("detects duplicate assets and prunes only expired history", async () => {
    const db = database();
    const old = "2020-01-01T00:00:00.000Z";
    const now = new Date().toISOString();
    await db.assets.bulkPut([
      { id: "a", kind: "capture", name: "A", metadata: { sha256: "same" }, createdAt: now, updatedAt: now },
      { id: "b", kind: "capture", name: "B", metadata: { sha256: "same" }, createdAt: now, updatedAt: now }
    ]);
    await db.historyEvents.bulkPut([
      { id: "old", type: "test", message: "old", createdAt: old },
      { id: "new", type: "test", message: "new", createdAt: now }
    ]);
    await setHistoryRetention(db, 30);
    expect((await loadMaintenanceSummary(db)).duplicateGroups[0]?.assetIds).toEqual(["a", "b"]);
    await pruneHistory(db);
    expect((await db.historyEvents.toArray()).map((event) => event.id)).toEqual(["new"]);
  });

  it("diagnostics include counts but exclude user content and secrets", async () => {
    const db = database();
    const now = new Date().toISOString();
    await db.historyEvents.add({ id: "e", type: "batch.failed", message: "private prompt secret", createdAt: now });
    await db.settingsMeta.add({ key: "providerCapabilities", value: { authentication: "error" }, updatedAt: now });
    const output = await createDiagnosticExport(db, "0.1.0", now);
    expect(output.text).toContain("batch.failed");
    expect(output.text).not.toContain("private prompt secret");
  });
});
