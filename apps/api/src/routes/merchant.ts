import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mastercardPartnerRail, visaPartnerRail } from "../rails/card-stubs.js";
import { upiDirectRail } from "../rails/upi-direct.js";
import { getMerchantConfig, updateMerchantConfig } from "../services/merchant.js";
import { listWebhookDeliveries } from "../services/webhooks.js";

const updateSchema = z.object({
  primaryVpa: z
    .string()
    .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)
    .optional(),
  secondaryVpa: z
    .string()
    .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)
    .nullable()
    .optional(),
  displayName: z.string().min(1).max(64).optional(),
  brandName: z.string().min(1).max(64).optional(),
  accentColor: z.string().min(4).max(32).optional(),
  logoUrl: z.string().url().nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
});

export async function merchantRoutes(app: FastifyInstance) {
  app.get("/api/merchant/config", async () => {
    const config = getMerchantConfig();
    return {
      config: {
        primaryVpa: config.primaryVpa,
        secondaryVpa: config.secondaryVpa,
        displayName: config.displayName,
        brandName: config.brandName,
        accentColor: config.accentColor,
        logoUrl: config.logoUrl,
        webhookUrl: config.webhookUrl,
        paymentTtlMs: config.paymentTtlMs,
        updatedAt: config.updatedAt,
      },
    };
  });

  app.put("/api/merchant/config", async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const config = updateMerchantConfig(parsed.data);
    return {
      config: {
        primaryVpa: config.primaryVpa,
        secondaryVpa: config.secondaryVpa,
        displayName: config.displayName,
        brandName: config.brandName,
        accentColor: config.accentColor,
        logoUrl: config.logoUrl,
        webhookUrl: config.webhookUrl,
        paymentTtlMs: config.paymentTtlMs,
        updatedAt: config.updatedAt,
      },
    };
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
