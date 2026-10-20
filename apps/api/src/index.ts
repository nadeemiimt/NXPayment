import { config } from "./config.js";
import { buildApp } from "./app.js";
import { expireDuePayments } from "./services/payments.js";

const app = await buildApp();

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
