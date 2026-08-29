import { describe, expect, it } from "vitest";
import { parseLegacyBackup } from "./legacy-import";

describe("legacy backup migration", () => {
  it("imports analyses and prompt versions while always discarding secrets", () => {
    const result = parseLegacyBackup({
      format: "visual-lens-backup",
      schemaVersion: 1,
      settings: { apiKey: "secret", rememberApiKey: true, apiBaseUrl: "https://api.example.com/v1" },
      analyses: [{ id: "a", sha256: "hash", model: "vision", result: { ok: true }, generatedAt: "2026-08-29T00:00:00.000Z" }],
      promptVersions: [{ id: "p", positivePrompt: "prompt", createdAt: "2026-08-29T00:00:00.000Z" }]
    });
    expect(result.discardedSecrets).toBe(true);
    expect(result.settings).not.toHaveProperty("apiKey");
    expect(result.settings).not.toHaveProperty("rememberApiKey");
    expect(result.analyses).toHaveLength(1);
    expect(result.prompts[0]?.text).toBe("prompt");
  });
});
