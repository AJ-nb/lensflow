import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repository = process.env.GITHUB_REPOSITORY || "AJ-nb/lensflow";
const outputPath = resolve("apps/site/public/latest.json");
const fallback = {
  status: "unreleased",
  plannedVersion: JSON.parse(await readFile(resolve("apps/extension/package.json"), "utf8")).version,
  minimumChrome: "122",
  bridgeProtocol: 1
};
const headers = { Accept: "application/vnd.github+json", "User-Agent": "lensflow-release-feed" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

try {
  const releaseResponse = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers });
  if (releaseResponse.status === 404) throw new Error("NO_RELEASE");
  if (!releaseResponse.ok) throw new Error(`GitHub release lookup failed with ${releaseResponse.status}.`);
  const release = await releaseResponse.json();
  const asset = Array.isArray(release.assets) ? release.assets.find((item) => item?.name === "latest.json") : undefined;
  if (!asset?.browser_download_url) throw new Error("Latest release does not contain latest.json.");
  const manifestResponse = await fetch(asset.browser_download_url, { headers });
  if (!manifestResponse.ok) throw new Error(`Release manifest download failed with ${manifestResponse.status}.`);
  const manifest = await manifestResponse.json();
  if (manifest?.status !== "published" || typeof manifest.version !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256 || "")) {
    throw new Error("Release manifest is invalid.");
  }
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Hydrated published release v${manifest.version}.`);
} catch (error) {
  if (error instanceof Error && error.message !== "NO_RELEASE") console.warn(error.message);
  await writeFile(outputPath, `${JSON.stringify(fallback, null, 2)}\n`);
  console.log("No verified release manifest is available; using unreleased state.");
}
