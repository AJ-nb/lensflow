import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(projectRoot, ".output", "chrome-mv3");
const mirrorDir = resolve(projectRoot, "..", "..", ".output", "chrome-mv3");
const manifest = JSON.parse(await readFile(resolve(sourceDir, "manifest.json"), "utf8"));

await rm(mirrorDir, { recursive: true, force: true });
await mkdir(mirrorDir, { recursive: true });
await cp(sourceDir, mirrorDir, { recursive: true, force: true });

console.log(`Chrome 加载目录已同步：v${manifest.version} -> ${mirrorDir}`);
