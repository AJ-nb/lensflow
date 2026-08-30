import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPackage = JSON.parse(await readFile(resolve(root, "apps/extension/package.json"), "utf8"));
const version = extensionPackage.version;
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`Tag ${process.env.GITHUB_REF_NAME} does not match package version v${version}.`);
}
const outputDir = resolve(root, "apps/extension/.output");
const files = await readdir(outputDir);
const sourceName = files.find((name) => name.endsWith("-chrome.zip"));
if (!sourceName) throw new Error(`No Chrome ZIP found in ${outputDir}. Run npm run zip first.`);

const distDir = resolve(root, "dist");
await mkdir(distDir, { recursive: true });
const releaseName = `lensflow-v${version}-chrome.zip`;
const releasePath = resolve(distDir, releaseName);
await copyFile(resolve(outputDir, sourceName), releasePath);
const bytes = await readFile(releasePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const repository = process.env.GITHUB_REPOSITORY || "AJ-nb/lensflow";
const publishedAt = process.env.LENSFLOW_PUBLISHED_AT || new Date().toISOString();
const manifest = {
  status: "published",
  version,
  channel: version.includes("-") ? "beta" : "stable",
  publishedAt,
  minimumChrome: "122",
  bridgeProtocol: 2,
  downloadUrl: `https://github.com/${repository}/releases/download/v${version}/${releaseName}`,
  sha256,
  notesUrl: `https://github.com/${repository}/releases/tag/v${version}`
};
await writeFile(resolve(distDir, "SHA256SUMS.txt"), `${sha256}  ${basename(releasePath)}\n`);
await writeFile(resolve(distDir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(resolve(root, "apps/site/public/latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${releaseName} (${sha256})`);
