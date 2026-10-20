import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { getDb } from "./db/schema.js";
import { merchantRoutes } from "./routes/merchant.js";
import { paymentRoutes } from "./routes/payments.js";
import { expireDuePayments } from "./services/payments.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: config.corsOrigin === "*" ? true : config.corsOrigin });
await app.register(sensible);

getDb();

app.get("/health", async () => ({ ok: true, service: "nxpayment-api" }));

await app.register(paymentRoutes);
await app.register(merchantRoutes);

const expireTimer = setInterval(() => {
  try {
    const n = expireDuePayments();
    if (n > 0) app.log.info({ expired: n }, "expired payments");
  } catch (err) {
    app.log.error(err, "expire job failed");
  }
}, config.expirePollMs);
expireTimer.unref();

await app.listen({ port: config.port, host: config.host });
app.log.info(`NXPayment API listening on http://${config.host}:${config.port}`);
