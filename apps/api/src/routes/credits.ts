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
      emailAddress: z.string().trim().email(),
      /** OAuth refresh token, IMAP app password, or "mock" */
      secret: z.string().min(1).max(2048),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_body",
        message: "Enter a valid mailbox email and secret.",
        details: parsed.error.flatten(),
      });
    }

    const provider = parsed.data.provider;
    const emailAddress = parsed.data.emailAddress.trim().toLowerCase();
    const secret = parsed.data.secret.trim();
    const domain = emailAddress.includes("@") ? emailAddress.split("@").pop() ?? "" : "";
    const blockedDomains = new Set([
      "example.com",
      "example.org",
      "example.net",
      "localhost",
      "test.com",
      "invalid",
    ]);
    const fakeSecrets = new Set(["mock", "fake-refresh", "fake", "test", "password", "secret"]);

    if (!emailAddress || blockedDomains.has(domain) || domain.endsWith(".example.com")) {
      return reply.code(400).send({
        error: "invalid_email",
        message:
          "Use a real mailbox address — not test@example.com, example.com, or localhost.",
      });
    }

    if (provider === "gmail") {
      if (domain !== "gmail.com" && domain !== "googlemail.com") {
        return reply.code(400).send({
          error: "invalid_gmail_address",
          message: "Gmail provider requires a @gmail.com or @googlemail.com address.",
        });
      }
      if (!secret || fakeSecrets.has(secret.toLowerCase())) {
        return reply.code(400).send({
          error: "invalid_gmail_secret",
          message:
            "Paste the real Gmail OAuth refresh token (not mock / fake-refresh). Use the mock tab for sample ingest.",
        });
      }
    }

    if (provider === "yahoo" && (!secret || fakeSecrets.has(secret.toLowerCase()))) {
      return reply.code(400).send({
        error: "invalid_secret",
        message: "Enter a real Yahoo credential (not mock / fake-refresh).",
      });
    }

    // Persist mailbox email + refresh token / app password / mock secret in SQLite.
    // Live Gmail list still needs OAuth app credentials; connect must succeed either way.
    const configDto = connectEmailMailbox({
      provider,
      emailAddress,
      secret: provider === "mock" ? secret || "mock" : secret,
    });
    let note = "Mailbox connected";
    if (provider === "gmail") {
      note = gmailOAuthConfigured()
        ? "Mailbox connected — polling will use this refresh token."
        : "Mailbox connected — credentials saved. Gmail OAuth Client ID/Secret not configured yet (save above or set GMAIL_CLIENT_*); live list may be empty until then. Mock ingest still works.";
    } else if (provider === "yahoo") {
      note = yahooOAuthConfigured()
        ? "Mailbox connected — polling will use this credential."
        : "Mailbox connected — credentials saved. Yahoo OAuth/IMAP not fully configured; mock ingest still works.";
    } else {
      note = "Mailbox connected — mock inbox ready for sample ingest.";
    }
    return {
      config: {
        emailConnected: configDto.emailConnected,
        emailProvider: configDto.emailProvider,
        emailAddress: configDto.emailAddress,
        emailConnectedAt: configDto.emailConnectedAt,
        emailAutoConfirm: configDto.emailAutoConfirm,
        autoConfirmEnabled: configDto.autoConfirmEnabled,
      },
      note,
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
