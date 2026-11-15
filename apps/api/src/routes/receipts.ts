import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  buildEscPosBinary,
  buildReceipt,
  getReceiptSettings,
  sendToPrintBridge,
  updateReceiptSettings,
} from "../services/receipts.js";

const settingsSchema = z.object({
  paperWidthMm: z.union([z.literal(58), z.literal(80)]).optional(),
  headerText: z.string().max(256).nullable().optional(),
  footerText: z.string().max(256).nullable().optional(),
  thankYouText: z.string().max(256).nullable().optional(),
});

export async function receiptRoutes(app: FastifyInstance) {
  app.get("/api/merchant/receipt-settings", async () => {
    return { receipt: getReceiptSettings() };
  });

  app.put("/api/merchant/receipt-settings", async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const receipt = updateReceiptSettings(parsed.data);
    return { receipt };
  });

  app.get("/api/merchant/payments/:id/receipt", async (req, reply) => {
    const { id } = req.params as { id: string };
    const receipt = buildReceipt(id);
    if (!receipt) return reply.code(404).send({ error: "not_found" });
    return { receipt };
  });

  app.get("/api/merchant/payments/:id/receipt.escpos", async (req, reply) => {
    const { id } = req.params as { id: string };
    const buf = buildEscPosBinary(id);
    if (!buf) return reply.code(404).send({ error: "not_found" });
    return reply
      .header("Content-Type", "application/octet-stream")
      .header(
        "Content-Disposition",
        `attachment; filename="nxpayment-${id.slice(0, 8)}.bin"`
      )
      .send(buf);
  });

  app.post("/api/merchant/payments/:id/receipt/bridge-print", async (req, reply) => {
    const { id } = req.params as { id: string };
    const receipt = buildReceipt(id);
    if (!receipt) return reply.code(404).send({ error: "not_found" });
    return { bridge: sendToPrintBridge(id), receipt };
  });
}
