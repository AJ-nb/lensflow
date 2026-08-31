import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repository = process.env.GITHUB_REPOSITORY || "AJ-nb/lensflow";
const version = JSON.parse(await readFile(resolve("apps/extension/package.json"), "utf8")).version;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "lensflow-release-feed" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const fallback = (channel) => ({
  schemaVersion: 2,
  status: "unreleased",
  plannedVersion: channel === "beta" && !version.includes("-") ? `${version}-beta.1` : version,
  channel,
  minimumChrome: "122",
  bridgeProtocol: 2,
  dataVersion: 2,
  minimumDataVersion: 1
});

async function loadReleases() {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=30`, { headers });
  if (!response.ok) throw new Error(`GitHub release lookup failed with ${response.status}.`);
  const releases = await response.json();
  return Array.isArray(releases) ? releases : [];
}

function validPublishedManifest(manifest, channel) {
  if (manifest?.status !== "published" || manifest.channel !== channel || typeof manifest.version !== "string") return false;
  if (manifest.schemaVersion === 2) {
    return Array.isArray(manifest.artifacts) && manifest.artifacts.some((artifact) => artifact?.distribution === "github-zip" && Number.isInteger(artifact.sizeBytes) && /^[a-f0-9]{64}$/.test(artifact.sha256 || ""));
  }
  return /^[a-f0-9]{64}$/.test(manifest.sha256 || "");
}

async function hydrate(channel, releases) {
  const fileName = channel === "stable" ? "latest.json" : "beta.json";
  const outputPath = resolve(`apps/site/public/${fileName}`);
  try {
    const release = releases.find((item) => !item?.draft && (channel === "beta" ? item?.prerelease : !item?.prerelease));
    if (!release) throw new Error("NO_RELEASE");
    const asset = Array.isArray(release.assets) ? release.assets.find((item) => item?.name === fileName) : undefined;
    if (!asset?.browser_download_url) throw new Error(`Release does not contain ${fileName}.`);
    const response = await fetch(asset.browser_download_url, { headers });
    if (!response.ok) throw new Error(`Release manifest download failed with ${response.status}.`);
    const manifest = await response.json();
    if (!validPublishedManifest(manifest, channel)) throw new Error(`${fileName} is invalid.`);
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Hydrated ${channel} release v${manifest.version}.`);
  } catch (error) {
    if (error instanceof Error && error.message !== "NO_RELEASE") console.warn(error.message);
    await writeFile(outputPath, `${JSON.stringify(fallback(channel), null, 2)}\n`);
    console.log(`No verified ${channel} release is available; using unreleased state.`);
  }
}

let releases = [];
try { releases = await loadReleases(); } catch (error) { console.warn(error instanceof Error ? error.message : String(error)); }
await hydrate("stable", releases);
await hydrate("beta", releases);
