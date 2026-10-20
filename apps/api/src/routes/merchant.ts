import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mastercardPartnerRail, visaPartnerRail } from "../rails/card-stubs.js";
import { upiDirectRail } from "../rails/upi-direct.js";
import { getMerchantConfig, updateMerchantConfig } from "../services/merchant.js";
import { listWebhookDeliveries } from "../services/webhooks.js";

const vpa = z.string().regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, "Invalid VPA");

const updateSchema = z.object({
  primaryVpa: vpa.optional(),
  secondaryVpa: z.preprocess(
    (v) => (v === "" ? null : v),
    vpa.nullable().optional()
  ),
  displayName: z.string().min(1).max(64).optional(),
  brandName: z.string().min(1).max(64).optional(),
  accentColor: z.preprocess(
    (v) =>
      typeof v === "string" && v.trim().length > 0 && v.trim().length < 4
        ? "#0B6E4F"
        : typeof v === "string" && v.trim() === ""
          ? "#0B6E4F"
          : v,
    z.string().min(4).max(32).optional()
  ),
  logoUrl: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().url().nullable().optional()
  ),
  webhookUrl: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().url().nullable().optional()
  ),
  autoConfirmEnabled: z.boolean().optional(),
  androidAutoConfirm: z.boolean().optional(),
  emailAutoConfirm: z.boolean().optional(),
  singleSlotFifo: z.boolean().optional(),
});

function publicConfig(config: ReturnType<typeof getMerchantConfig>) {
  return {
    primaryVpa: config.primaryVpa,
    secondaryVpa: config.secondaryVpa,
    displayName: config.displayName,
    brandName: config.brandName,
    accentColor: config.accentColor,
    logoUrl: config.logoUrl,
    webhookUrl: config.webhookUrl,
    paymentTtlMs: config.paymentTtlMs,
    updatedAt: config.updatedAt,
    autoConfirmEnabled: config.autoConfirmEnabled,
    androidAutoConfirm: config.androidAutoConfirm,
    emailAutoConfirm: config.emailAutoConfirm,
    emailConnected: config.emailConnected,
    emailProvider: config.emailProvider,
    emailAddress: config.emailAddress,
    emailConnectedAt: config.emailConnectedAt,
    singleSlotFifo: config.singleSlotFifo,
  };
}

export async function merchantRoutes(app: FastifyInstance) {
  app.get("/api/merchant/config", async () => {
    return { config: publicConfig(getMerchantConfig()) };
  });

  app.put("/api/merchant/config", async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const config = updateMerchantConfig(parsed.data);
    return { config: publicConfig(config) };
  });

  app.get("/api/merchant/webhooks", async () => {
    return { deliveries: listWebhookDeliveries() };
  });

  app.get("/api/rails", async () => {
    const [upi, visa, mc] = await Promise.all([
      upiDirectRail.healthCheck(),
      visaPartnerRail.healthCheck(),
      mastercardPartnerRail.healthCheck(),
    ]);
    return {
      rails: [
        { id: "upi_direct", enabled: true, health: upi },
        { id: "visa_partner", enabled: false, health: visa, note: "stub" },
        { id: "mastercard_partner", enabled: false, health: mc, note: "stub" },
      ],
    };
  });

  app.post("/api/rails/:id/checkout", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === "visa_partner" || id === "mastercard_partner") {
      return reply.code(501).send({
        error: "not_enabled",
        message: `${id} is a stub — card acquiring requires a partner`,
      });
    }
    return reply.code(400).send({ error: "use_payments_create", message: "Use POST /api/payments" });
  });
}
