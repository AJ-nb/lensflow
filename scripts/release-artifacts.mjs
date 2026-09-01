import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
const sourceCandidates = files.filter((name) => name.endsWith(`-${version}-chrome.zip`));
if (sourceCandidates.length !== 1) {
  throw new Error(`Expected one Chrome ZIP for v${version} in ${outputDir}, found ${sourceCandidates.length}. Run npm run zip first.`);
}
const sourceName = sourceCandidates[0];

const distDir = resolve(root, "dist");
await mkdir(distDir, { recursive: true });
const releaseName = `lensflow-v${version}-chrome.zip`;
const releasePath = resolve(distDir, releaseName);
await copyFile(resolve(outputDir, sourceName), releasePath);
const bytes = await readFile(releasePath);
const sizeBytes = (await stat(releasePath)).size;
const sha256 = createHash("sha256").update(bytes).digest("hex");
const repository = process.env.GITHUB_REPOSITORY || "AJ-nb/lensflow";
const publishedAt = process.env.LENSFLOW_PUBLISHED_AT || new Date().toISOString();
const manifest = {
  schemaVersion: 2,
  status: "published",
  version,
  channel: version.includes("-") ? "beta" : "stable",
  publishedAt,
  minimumChrome: "122",
  bridgeProtocol: 2,
  dataVersion: 3,
  minimumDataVersion: 1,
  migration: {
    required: true,
    backupRecommended: true,
    notes: "首次打开会自动清理旧错误中的 HTML 和过长响应，同时保留分析、任务与历史记录；覆盖安装前建议导出备份。"
  },
  artifacts: [
    {
      browser: "chrome",
      distribution: "github-zip",
      url: `https://github.com/${repository}/releases/download/v${version}/${releaseName}`,
      sizeBytes,
      sha256
    },
    ...(process.env.LENSFLOW_CHROME_STORE_URL ? [{ browser: "chrome", distribution: "chrome-web-store", url: process.env.LENSFLOW_CHROME_STORE_URL }] : [])
  ],
  notesUrl: `https://github.com/${repository}/releases/tag/v${version}`
};
const feedName = manifest.channel === "beta" ? "beta.json" : "latest.json";
await writeFile(resolve(distDir, "SHA256SUMS.txt"), `${sha256}  ${basename(releasePath)}\n`);
await writeFile(resolve(distDir, feedName), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(resolve(root, `apps/site/public/${feedName}`), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${releaseName} (${sha256})`);
