/**
 * Fail fast with a clear message when Node is too old, or when
 * better-sqlite3 was compiled for a different NODE_MODULE_VERSION.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  console.error(
    `\nNXPayment API tests require Node.js 20+ (Fastify 5).\n` +
      `Current: ${process.version} (${process.execPath})\n` +
      `Fix: install/use Node 20+ (e.g. \`nvm install 20 && nvm use 20\`, or Homebrew node).\n` +
      `Then re-run: npm run test:integration\n`
  );
  process.exit(1);
}

const rebuildHint =
  "Run `npm rebuild better-sqlite3` (or reinstall node_modules) under the same Node you use for tests.";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(apiRoot, "package.json"));
try {
  require("better-sqlite3");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/NODE_MODULE_VERSION|better-sqlite3/i.test(msg)) {
    console.error(
      `\nbetter-sqlite3 native addon does not match this Node (${process.version}, NODE_MODULE_VERSION ${process.versions.modules}).\n` +
        `${msg}\n\n` +
        `${rebuildHint}\n` +
        `From repo root: npm rebuild better-sqlite3 && npm run test:integration\n`
    );
    process.exit(1);
  }
  console.error(`\nFailed to load better-sqlite3:\n${msg}\n`);
  process.exit(1);
}
