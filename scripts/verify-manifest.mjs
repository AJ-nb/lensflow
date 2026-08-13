import { readFile } from "node:fs/promises";

const manifestPath = new URL("../.output/chrome-mv3/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

if (manifest.name !== "砚台") failures.push(`name is ${JSON.stringify(manifest.name)}`);
if (manifest.version !== "0.6.2") failures.push(`version is ${JSON.stringify(manifest.version)}`);
if ((manifest.content_scripts ?? []).length > 0) failures.push("content_scripts must not be registered at startup");
if ((manifest.permissions ?? []).includes("activeTab")) failures.push("activeTab is redundant with automatic page picker host access");

const requiredHosts = new Set(manifest.host_permissions ?? []);
for (const origin of ["http://*/*", "https://*/*"]) {
  if (!requiredHosts.has(origin)) failures.push(`missing page picker host permission ${origin}`);
}

for (const size of ["16", "32", "48", "128"]) {
  if (!manifest.icons?.[size]) failures.push(`missing ${size}px icon`);
}

if (failures.length > 0) {
  console.error(`Manifest verification failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Manifest verified: 砚台 v0.6.2, automatic page picker hosts, no startup content scripts.");
}
