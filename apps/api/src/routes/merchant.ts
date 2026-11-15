import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listProviders } from "../rails/registry.js";
import {
  generateAgentKey,
  getAgentKeyStatus,
  revokeAgentKey,
  revokeAllAgentKeys,
} from "../services/agent-keys.js";
import { getMerchantConfig, updateMerchantConfig } from "../services/merchant.js";
import {
  getProviderSettings,
  updateProviderSettings,
} from "../services/providers.js";
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

  app.get("/api/merchant/providers", async () => {
    return { providers: getProviderSettings() };
  });

  app.put("/api/merchant/providers", async (req, reply) => {
    const parsed = z
      .object({
        upiEnabled: z.boolean().optional(),
        cardsEnabled: z.boolean().optional(),
        otherEnabled: z.boolean().optional(),
        primaryProvider: z.string().optional(),
        backupProvider: z.string().nullable().optional(),
        agentsEnabled: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    return { providers: updateProviderSettings(parsed.data) };
  });

  app.get("/api/merchant/agents", async () => {
    return getAgentKeyStatus();
  });

  app.post("/api/merchant/agents/keys", async (req, reply) => {
    const parsed = z
      .object({ name: z.string().min(1).max(64).optional() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const settings = getProviderSettings();
    if (!settings.agentsEnabled) {
      updateProviderSettings({ agentsEnabled: true });
    }
    const generated = generateAgentKey(parsed.data.name ?? "default");
    return reply.code(201).send({
      ...generated,
      warning: "Copy the apiKey now — it is shown once and never stored in plaintext.",
    });
  });

  app.post("/api/merchant/agents/keys/:id/revoke", async (req, reply) => {
    const { id } = req.params as { id: string };
    const key = revokeAgentKey(id);
    if (!key) return reply.code(404).send({ error: "not_found" });
    return { key };
  });

  app.post("/api/merchant/agents/revoke-all", async () => {
    const revoked = revokeAllAgentKeys();
    return { revoked, ...getAgentKeyStatus() };
  });

  app.get("/api/rails", async () => {
    const settings = getProviderSettings();
    const rails = await Promise.all(
      listProviders().map(async (p) => ({
        id: p.id,
        label: p.capabilities.label,
        category: p.capabilities.category,
        enabled:
          (p.capabilities.category === "upi" && settings.upiEnabled) ||
          (p.capabilities.category === "cards" && settings.cardsEnabled) ||
          (p.capabilities.category === "other" && settings.otherEnabled),
        health: await p.healthCheck(),
        note: p.capabilities.create ? undefined : "not configured (stub)",
      }))
    );
    return {
      rails,
      primary: settings.primaryProvider,
      backup: settings.backupProvider,
    };
  });

  app.post("/api/rails/:id/checkout", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (
      id === "card_partner_visa" ||
      id === "card_partner_mastercard" ||
      id === "authorize_net" ||
      id === "visa_partner" ||
      id === "mastercard_partner"
    ) {
      return reply.code(501).send({
        error: "not_configured",
        message: `${id} is not configured — partner acquiring required (stub only)`,
      });
    }
    return reply
      .code(400)
      .send({ error: "use_payments_create", message: "Use POST /api/payments" });
  });
}
