import { spawn } from "node:child_process";
import { resolve } from "node:path";

const env = { ...process.env };
delete env.CODEX_THREAD_ID;
const child = spawn(process.execPath, [
  resolve("apps/site/node_modules/astro/bin/astro.mjs"),
  "dev",
  "--host",
  process.env.LENSFLOW_DEV_HOST || "127.0.0.1",
  "--port",
  process.env.LENSFLOW_DEV_PORT || "4321"
], { cwd: resolve("apps/site"), env, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
