#!/usr/bin/env node
/**
 * Start API (:3847) + web (:4321) for local development.
 * Usage: node scripts/dev-up.mjs
 *
 * Optional env:
 *   DB_PATH — SQLite path (default data/nxpayment.sqlite)
 *   API_PORT / WEB_PORT — rarely needed; package scripts pin 3847 / 4321
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const kids = [];

function run(name, npmArgs, extraEnv = {}) {
  const child = spawn("npm", npmArgs, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    console.error(`[dev-up] ${name} exited code=${code} signal=${signal}`);
    for (const k of kids) {
      if (k !== child && !k.killed) k.kill("SIGTERM");
    }
    process.exit(code ?? 1);
  });
  kids.push(child);
}

run("api", ["run", "dev:api"]);
run("web", ["run", "dev:web"]);

function shutdown() {
  for (const k of kids) {
    if (!k.killed) k.kill("SIGTERM");
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
