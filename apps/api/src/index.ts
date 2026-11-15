import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { getDb } from "./db/schema.js";
import { displayRoutes } from "./routes/display.js";
import { loyaltyRoutes } from "./routes/loyalty.js";
import { merchantRoutes } from "./routes/merchant.js";
import { paymentRoutes } from "./routes/payments.js";
import { receiptRoutes } from "./routes/receipts.js";
import { reportRoutes } from "./routes/reports.js";
import { shopRoutes } from "./routes/shops.js";
import { storageRoutes } from "./routes/storage.js";
import { expireDuePayments } from "./services/payments.js";
import { runSecondaryBackup, shouldRunPeriodicBackup } from "./services/storage.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: config.corsOrigin === "*" ? true : config.corsOrigin });
await app.register(sensible);

getDb();

app.get("/health", async () => ({ ok: true, service: "nxpayment-api" }));

await app.register(paymentRoutes);
await app.register(merchantRoutes);
await app.register(storageRoutes);
await app.register(shopRoutes);
await app.register(displayRoutes);
await app.register(reportRoutes);
await app.register(receiptRoutes);
await app.register(loyaltyRoutes);

const expireTimer = setInterval(() => {
  try {
    const n = expireDuePayments();
    if (n > 0) app.log.info({ expired: n }, "expired payments");
  } catch (err) {
    app.log.error(err, "expire job failed");
  }
}, config.expirePollMs);
expireTimer.unref();

const backupTimer = setInterval(() => {
  try {
    if (!shouldRunPeriodicBackup()) return;
    const result = runSecondaryBackup();
    if (!result.ok) app.log.warn({ err: result.error }, "secondary backup failed");
    else app.log.info({ dest: result.copiedTo, bytes: result.bytes }, "secondary backup ok");
  } catch (err) {
    app.log.error(err, "backup job failed");
  }
}, config.storageBackupIntervalMs);
backupTimer.unref();

await app.listen({ port: config.port, host: config.host });
app.log.info(`NXPayment API listening on http://${config.host}:${config.port}`);
