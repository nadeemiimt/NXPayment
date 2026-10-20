import { config } from "./config.js";
import { buildApp } from "./app.js";
import { pollEmailCreditsOnce } from "./services/email/poller.js";
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

const emailTimer = setInterval(() => {
  void pollEmailCreditsOnce()
    .then((r) => {
      if (r.confirmed > 0 || r.scanned > 0) {
        app.log.info(r, "email credit poll");
      }
    })
    .catch((err) => app.log.error(err, "email poll failed"));
}, config.emailPollMs);
emailTimer.unref();

await app.listen({ port: config.port, host: config.host });
app.log.info(`NXPayment API listening on http://${config.host}:${config.port}`);
