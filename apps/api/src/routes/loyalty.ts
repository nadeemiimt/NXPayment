import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptNextBestOffer,
  enrollCustomer,
  findCustomerByPhone,
  getCustomer,
  getLoyaltyRules,
  getNextBestOffer,
  listCustomers,
  loyaltyNudges,
  recordPurchase,
  updateLoyaltyRules,
} from "../services/loyalty.js";

export async function loyaltyRoutes(app: FastifyInstance) {
  app.get("/api/merchant/loyalty/rules", async () => {
    return { rules: getLoyaltyRules() };
  });

  app.put("/api/merchant/loyalty/rules", async (req, reply) => {
    const parsed = z
      .object({
        pointsPerRupee: z.number().nonnegative().optional(),
        paisePerPointRedeem: z.number().int().nonnegative().optional(),
        silverThresholdPaise: z.number().int().nonnegative().optional(),
        goldThresholdPaise: z.number().int().nonnegative().optional(),
        stampVisitsRequired: z.number().int().nonnegative().optional(),
        stampRewardPaise: z.number().int().nonnegative().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    return { rules: updateLoyaltyRules(parsed.data) };
  });

  app.get("/api/merchant/loyalty/customers", async (req) => {
    const q = req.query as { q?: string; limit?: string };
    return {
      customers: listCustomers({
        q: q.q,
        limit: q.limit ? Number(q.limit) : 100,
      }),
    };
  });

  app.post("/api/merchant/loyalty/customers", async (req, reply) => {
    const parsed = z
      .object({
        phone: z.string().min(8).max(20),
        name: z.string().max(128).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const customer = enrollCustomer(parsed.data);
      return reply.code(201).send({ customer });
    } catch (err) {
      return reply.code(400).send({ error: "enroll_failed", message: (err as Error).message });
    }
  });

  app.get("/api/merchant/loyalty/customers/by-phone/:phone", async (req, reply) => {
    const { phone } = req.params as { phone: string };
    const customer = findCustomerByPhone(decodeURIComponent(phone));
    if (!customer) return reply.code(404).send({ error: "not_found" });
    return {
      customer,
      rules: getLoyaltyRules(),
      nextBestOffer: getNextBestOffer(customer.id),
    };
  });

  app.get("/api/merchant/loyalty/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = getCustomer(id);
    if (!customer) return reply.code(404).send({ error: "not_found" });
    return { customer, nextBestOffer: getNextBestOffer(id) };
  });

  app.get("/api/merchant/loyalty/customers/:id/next-offer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const offer = getNextBestOffer(id);
    if (!offer) return reply.code(404).send({ error: "not_found" });
    return { offer };
  });

  app.post("/api/merchant/loyalty/customers/:id/accept-offer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        offerId: z.string().min(1),
        kind: z.enum(["discount_paise", "points_bonus"]),
        discountPaise: z.number().int().nonnegative().optional(),
        pointsBonus: z.number().int().nonnegative().optional(),
        paymentId: z.string().optional(),
        amountPaise: z.number().int().positive().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const result = acceptNextBestOffer({
        customerId: id,
        ...parsed.data,
      });
      return { result };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: "accept_failed", message: (err as Error).message });
    }
  });

  app.post("/api/merchant/loyalty/customers/:id/purchase", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        amountPaise: z.number().int().positive(),
        paymentId: z.string().optional(),
        pointsToRedeem: z.number().int().nonnegative().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const result = recordPurchase({
        customerId: id,
        amountPaise: parsed.data.amountPaise,
        paymentId: parsed.data.paymentId,
        pointsToRedeem: parsed.data.pointsToRedeem,
      });
      return { result };
    } catch (err) {
      return reply.code(400).send({ error: "purchase_failed", message: (err as Error).message });
    }
  });

  app.get("/api/merchant/loyalty/nudges", async () => {
    return { nudges: loyaltyNudges() };
  });

  app.post("/api/merchant/loyalty/encourage", async (req, reply) => {
    const parsed = z
      .object({
        customerId: z.string(),
        channel: z.enum(["note", "whatsapp_stub"]),
        message: z.string().max(500),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const customer = getCustomer(parsed.data.customerId);
    if (!customer) return reply.code(404).send({ error: "not_found" });
    return {
      ok: true,
      channel: parsed.data.channel,
      stub: parsed.data.channel === "whatsapp_stub",
      to: customer.phone,
      message: parsed.data.message,
      note:
        parsed.data.channel === "whatsapp_stub"
          ? "WhatsApp send is a stub — message prepared only."
          : "Manual encourage note recorded in response (no persistence beyond ledger in Slice 2).",
    };
  });
}
