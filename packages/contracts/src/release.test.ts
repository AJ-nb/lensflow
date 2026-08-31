import { describe, expect, it } from "vitest";
import { findReleaseArtifact, normalizeReleaseManifest, releaseManifestSchema } from "./release";

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

  it("parses a v2 multi-channel manifest with migration metadata", () => {
    const manifest = normalizeReleaseManifest({
      schemaVersion: 2,
      status: "published",
      version: "0.3.0",
      channel: "stable",
      publishedAt: "2026-08-31T00:00:00.000Z",
      minimumChrome: "122",
      bridgeProtocol: 2,
      dataVersion: 2,
      minimumDataVersion: 1,
      migration: { required: false, backupRecommended: true },
      artifacts: [{ browser: "chrome", distribution: "github-zip", url: "https://github.com/AJ-nb/lensflow/releases/download/v0.3.0/lensflow.zip", sizeBytes: 1024, sha256: "b".repeat(64) }],
      notesUrl: "https://github.com/AJ-nb/lensflow/releases/tag/v0.3.0"
    });
    expect(manifest.schemaVersion).toBe(2);
    expect(findReleaseArtifact(manifest, "github-zip")?.sizeBytes).toBe(1024);
  });

  it("requires size and hash for v2 GitHub ZIP artifacts", () => {
    expect(() => releaseManifestSchema.parse({
      schemaVersion: 2,
      status: "published",
      version: "0.3.0",
      channel: "stable",
      publishedAt: "2026-08-31T00:00:00.000Z",
      minimumChrome: "122",
      bridgeProtocol: 2,
      dataVersion: 2,
      minimumDataVersion: 1,
      migration: { required: false, backupRecommended: true },
      artifacts: [{ browser: "chrome", distribution: "github-zip", url: "https://example.com/lensflow.zip" }],
      notesUrl: "https://github.com/AJ-nb/lensflow/releases/tag/v0.3.0"
    })).toThrow("sizeBytes");
  });
});
