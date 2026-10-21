import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listCreditObservations,
  observeCredit,
  type CreditSource,
} from "../services/credit-matcher.js";
import { pushMockEmail } from "../services/email/mock-adapter.js";
import { pollEmailCreditsOnce } from "../services/email/poller.js";
import {
  connectEmailMailbox,
  disconnectEmailMailbox,
  getMerchantConfig,
  updateMerchantConfig,
} from "../services/merchant.js";
import { gmailOAuthConfigured } from "../services/email/gmail-adapter.js";
import { yahooOAuthConfigured } from "../services/email/yahoo-adapter.js";
import { config } from "../config.js";

const observeSchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  utr: z.string().min(4).max(64).optional(),
  rawText: z.string().max(8000).optional(),
  subject: z.string().max(500).optional(),
  source: z.enum([
    "android_notification",
    "sms",
    "email_gmail",
    "email_yahoo",
    "email_mock",
    "manual",
  ]),
  observedAt: z.string().optional(),
});

export async function creditRoutes(app: FastifyInstance) {
  app.post("/api/credits/observe", async (req, reply) => {
    const parsed = observeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }
    const result = await observeCredit({
      ...parsed.data,
      source: parsed.data.source as CreditSource,
    });
    const code =
      result.outcome === "confirmed" || result.outcome === "idempotent"
        ? 200
        : result.outcome === "parse_failed"
          ? 422
          : 200;
    return reply.code(code).send(result);
  });

  // Alias used in product docs
  app.post("/api/payments/match-credit", async (req, reply) => {
    const parsed = observeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }
    const result = await observeCredit({
      ...parsed.data,
      source: parsed.data.source as CreditSource,
    });
    return reply.send(result);
  });

  app.get("/api/credits/observations", async () => {
    return { observations: listCreditObservations() };
  });

  app.get("/api/credits/email/status", async () => {
    const m = getMerchantConfig();
    return {
      autoConfirmEnabled: m.autoConfirmEnabled,
      androidAutoConfirm: m.androidAutoConfirm,
      emailAutoConfirm: m.emailAutoConfirm,
      emailConnected: m.emailConnected,
      emailProvider: m.emailProvider,
      emailAddress: m.emailAddress,
      emailConnectedAt: m.emailConnectedAt,
      gmailOAuthConfigured: gmailOAuthConfigured(),
      yahooOAuthConfigured: yahooOAuthConfigured(),
      yahooImapHost: Boolean(config.yahooImapHost),
      gmailRedirectUri: config.gmailRedirectUri,
      primaryVerification:
        "Bank SMS & Gmail alerts parsed in near real time — not aggregator webhooks",
    };
  });

  app.put("/api/credits/settings", async (req, reply) => {
    const schema = z.object({
      autoConfirmEnabled: z.boolean().optional(),
      androidAutoConfirm: z.boolean().optional(),
      emailAutoConfirm: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const configDto = updateMerchantConfig(parsed.data);
    return { config: configDto };
  });

  app.post("/api/credits/email/connect", async (req, reply) => {
    const schema = z.object({
      provider: z.enum(["gmail", "yahoo", "mock"]),
      emailAddress: z.string().email(),
      /** OAuth refresh token, IMAP app password, or "mock" */
      secret: z.string().min(1).max(2048),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    if (parsed.data.provider === "gmail" && !gmailOAuthConfigured()) {
      // Allow connect for docs/dev; live Gmail list needs OAuth app env
      // Secret may be app-password placeholder until OAuth is configured
    }
    const configDto = connectEmailMailbox(parsed.data);
    return {
      config: configDto,
      note:
        parsed.data.provider === "gmail" && !gmailOAuthConfigured()
          ? "Gmail OAuth Client ID/Secret not configured (Merchant Auto-confirm or GMAIL_CLIENT_* env) — live Gmail poll returns empty. Use mock ingest or paste samples for now."
          : undefined,
    };
  });

  app.post("/api/credits/email/disconnect", async () => {
    return { config: disconnectEmailMailbox() };
  });

  /** Dev/mock: push a sample bank credit email into the mock inbox, then poll. */
  app.post("/api/credits/email/ingest", async (req, reply) => {
    const schema = z.object({
      subject: z.string().min(1),
      body: z.string().min(1),
      from: z.string().optional(),
      receivedAt: z.string().optional(),
      poll: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const msg = pushMockEmail({
      subject: parsed.data.subject,
      bodyText: parsed.data.body,
      from: parsed.data.from ?? "alerts@bank.example",
      receivedAt: parsed.data.receivedAt ?? new Date().toISOString(),
    });
    // Ensure mock mailbox is connected for poller
    const m = getMerchantConfig();
    if (m.emailProvider !== "mock") {
      connectEmailMailbox({
        provider: "mock",
        emailAddress: m.emailAddress ?? "merchant@example.com",
        secret: "mock",
      });
    }
    updateMerchantConfig({ autoConfirmEnabled: true, emailAutoConfirm: true });
    let poll = { scanned: 0, confirmed: 0, skipped: 0 };
    if (parsed.data.poll !== false) {
      poll = await pollEmailCreditsOnce();
    }
    return { message: msg, poll };
  });

  app.post("/api/credits/email/poll", async () => {
    const poll = await pollEmailCreditsOnce();
    return { poll };
  });
}
