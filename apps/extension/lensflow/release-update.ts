import {
  findReleaseArtifact,
  normalizeReleaseManifest,
  releaseUpdateNoticeSchema,
  type ReleaseUpdateNotice
} from "@lensflow/contracts";

export const RELEASE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const STABLE_RELEASE_FEED_URL = "https://aj-nb.github.io/lensflow/latest.json";

export function compareReleaseVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const [core = "0.0.0", prerelease] = value.split("-", 2);
    return { core: core.split(".").map((part) => Number(part) || 0), prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return (a.core[index] ?? 0) - (b.core[index] ?? 0);
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export function shouldCheckManualUpdate(last: ReleaseUpdateNotice | null | undefined, now = Date.now()): boolean {
  if (!last) return true;
  const checkedAt = Date.parse(last.checkedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt >= RELEASE_CHECK_INTERVAL_MS;
}

export async function checkManualUpdate({
  currentVersion,
  previous,
  now = new Date(),
  fetcher = fetch
}: {
  currentVersion: string;
  previous?: unknown;
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<ReleaseUpdateNotice> {
  const parsedPrevious = releaseUpdateNoticeSchema.safeParse(previous);
  const safePrevious = parsedPrevious.success ? parsedPrevious.data : null;
  if (!shouldCheckManualUpdate(safePrevious, now.getTime())) return safePrevious!;
  const checkedAt = now.toISOString();
  try {
    const response = await fetcher(STABLE_RELEASE_FEED_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Release feed returned ${response.status}.`);
    const manifest = normalizeReleaseManifest(await response.json());
    const artifact = findReleaseArtifact(manifest, "github-zip");
    if (manifest.status !== "published" || manifest.channel !== "stable" || !artifact) throw new Error("No published stable ZIP is available.");
    return {
      status: compareReleaseVersions(manifest.version, currentVersion) > 0 ? "available" : "current",
      checkedAt,
      currentVersion,
      latestVersion: manifest.version,
      url: artifact.url
    };
  } catch {
    return { status: "offline", checkedAt, currentVersion };
  }
}

export function isChromeWebStoreInstall(updateUrl?: string): boolean {
  return Boolean(updateUrl && /google\.com\/service\/update2\/crx/i.test(updateUrl));
}
