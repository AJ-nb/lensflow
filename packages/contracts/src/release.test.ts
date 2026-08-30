import { describe, expect, it } from "vitest";
import { releaseManifestSchema } from "./release";

describe("release manifest", () => {
  it("keeps unreleased data free of download claims", () => {
    expect(releaseManifestSchema.parse({
      status: "unreleased",
      plannedVersion: "0.2.0",
      minimumChrome: "122",
      bridgeProtocol: 2
    }).status).toBe("unreleased");
    expect(() => releaseManifestSchema.parse({
      status: "unreleased",
      version: "0.2.0",
      minimumChrome: "122",
      bridgeProtocol: 2
    })).toThrow();
  });

  it("requires verified download metadata for published releases", () => {
    expect(releaseManifestSchema.parse({
      status: "published",
      version: "0.2.0",
      channel: "stable",
      publishedAt: "2026-08-29T00:00:00.000Z",
      minimumChrome: "122",
      bridgeProtocol: 2,
      downloadUrl: "https://github.com/AJ-nb/lensflow/releases/download/v0.2.0/lensflow.zip",
      sha256: "a".repeat(64),
      notesUrl: "https://github.com/AJ-nb/lensflow/releases/tag/v0.2.0"
    }).status).toBe("published");
  });
});
