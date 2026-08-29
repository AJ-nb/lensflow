import { rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "apps/site/dist");
const relativeDist = relative(root, dist).replaceAll("\\", "/");

if (relativeDist !== "apps/site/dist" || isAbsolute(relative(root, dist)) || relativeDist.startsWith("..")) {
  throw new Error(`Refusing to clean unexpected site output path: ${dist}`);
}

await rm(dist, { recursive: true, force: true });
console.log(`Cleaned site output: ${dist}`);
