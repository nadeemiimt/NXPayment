#!/usr/bin/env node
const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  console.error(
    `NXPayment requires Node.js 20+. Current: ${process.versions.node}`
  );
  process.exit(1);
}
