#!/usr/bin/env node
/**
 * Serve the Next web app for Playwright.
 * CI: expects a prior `npm run build --workspace=@nxpayment/web`, then `next start`.
 * Local: uses `next dev` when CI is unset for faster iteration.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useProd = !!process.env.CI || process.env.E2E_WEB_MODE === "start";
const args = useProd
  ? ["run", "start", "--workspace=@nxpayment/web"]
  : ["run", "dev", "--workspace=@nxpayment/web"];

const child = spawn("npm", args, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
