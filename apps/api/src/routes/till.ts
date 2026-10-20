import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cashierConfirmTill,
  createTillSale,
  listOpenTillSales,
} from "../services/till.js";

const createSchema = z.object({
  amountPaise: z.number().int().positive(),
  method: z.enum(["cash", "card_counter"]),
  merchantOrderId: z.string().min(1).max(128).optional(),
  note: z.string().max(256).optional(),
  /** Default true — mark SUCCESS when cash/card already taken. */
  confirm: z.boolean().optional(),
});

export async function tillRoutes(app: FastifyInstance) {
  app.post("/api/till/sales", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const payment = await createTillSale(parsed.data);
      return reply.code(201).send({ payment });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "till_failed", message });
    }
  });

  app.get("/api/till/open", async () => {
    return { payments: listOpenTillSales() };
  });

  app.post("/api/till/sales/:id/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const payment = await cashierConfirmTill(id);
      return { payment };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "cashier_confirm_failed", message });
    }
  });
}
