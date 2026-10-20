/** Fail fast with a clear message when Node is too old for Fastify 5 / this suite. */
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
