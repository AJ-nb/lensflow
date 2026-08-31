import { describe, expect, it, vi } from "vitest";
import { RELEASE_CHECK_INTERVAL_MS, checkManualUpdate, isChromeWebStoreInstall, shouldCheckManualUpdate } from "./release-update";

const currentVersion = "0.3.0";
const checkedAt = "2026-08-31T00:00:00.000Z";

function response(version = "0.3.1") {
  return new Response(JSON.stringify({
    schemaVersion: 2,
    status: "published",
    version,
    channel: "stable",
    publishedAt: checkedAt,
    minimumChrome: "122",
    bridgeProtocol: 2,
    dataVersion: 2,
    minimumDataVersion: 1,
    migration: { required: false, backupRecommended: true },
    artifacts: [{ browser: "chrome", distribution: "github-zip", url: `https://example.com/${version}.zip`, sizeBytes: 10, sha256: "a".repeat(64) }],
    notesUrl: `https://example.com/${version}`
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("manual release checks", () => {
  it("checks at most once per 24 hours", () => {
    const previous = { status: "current", checkedAt, currentVersion } as const;
    expect(shouldCheckManualUpdate(previous, Date.parse(checkedAt) + RELEASE_CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(shouldCheckManualUpdate(previous, Date.parse(checkedAt) + RELEASE_CHECK_INTERVAL_MS)).toBe(true);
  });

  it("reports a newer stable ZIP without downloading it", async () => {
    const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
    const result = await checkManualUpdate({ currentVersion, now: new Date(checkedAt), fetcher });
    expect(result).toMatchObject({ status: "available", latestVersion: "0.3.1", url: "https://example.com/0.3.1.zip" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps an offline check non-fatal and skips Web Store installs", async () => {
    const result = await checkManualUpdate({ currentVersion, now: new Date(checkedAt), fetcher: vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(result.status).toBe("offline");
    expect(isChromeWebStoreInstall("https://clients2.google.com/service/update2/crx")).toBe(true);
  });
});
