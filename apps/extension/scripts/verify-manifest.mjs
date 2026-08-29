import { readFile } from "node:fs/promises";

const manifestPath = new URL("../.output/chrome-mv3/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const failures = [];

if (manifest.name !== "镜序 Lensflow") failures.push(`name is ${JSON.stringify(manifest.name)}`);
if (manifest.version !== packageJson.version) failures.push(`version is ${JSON.stringify(manifest.version)}, expected ${packageJson.version}`);
for (const permission of ["activeTab", "downloads", "storage", "contextMenus", "sidePanel", "scripting"]) {
  if (!(manifest.permissions ?? []).includes(permission)) failures.push(`missing permission ${permission}`);
}

const requiredHosts = new Set(manifest.host_permissions ?? []);
if (!requiredHosts.has("https://aj-nb.github.io/lensflow/*")) failures.push("missing official Lensflow site bridge origin");
for (const broad of ["http://*/*", "https://*/*", "<all_urls>"]) {
  if (requiredHosts.has(broad)) failures.push(`forbidden required host permission ${broad}`);
}
for (const script of manifest.content_scripts ?? []) {
  const matches = script.matches ?? [];
  if (matches.some((match) => match !== "https://aj-nb.github.io/lensflow/*")) failures.push(`content script has unexpected match: ${matches.join(", ")}`);
}

for (const size of ["16", "32", "48", "128"]) {
  if (!manifest.icons?.[size]) failures.push(`missing ${size}px icon`);
}

if (failures.length > 0) {
  console.error(`Manifest verification failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Manifest verified: 镜序 Lensflow v${manifest.version}, restricted bridge origin and no broad required host access.`);
}
