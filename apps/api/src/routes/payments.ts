import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  FifoSlotBusyError,
  SameAmountInProgressError,
  cancelPayment,
  createPayment,
  getPayment,
  getTally,
  gstExportStub,
  listPayments,
  listPendingConfirms,
  merchantConfirm,
  merchantReject,
  reconciliationStub,
} from "../services/payments.js";
import {
  dismissAlert,
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
  unreadAlertCount,
} from "../services/risk.js";
import { sideEffectBreaker } from "../services/webhooks.js";

const createSchema = z.object({
  amountPaise: z.number().int().positive(),
  merchantOrderId: z.string().min(1).max(128).optional(),
  note: z.string().max(256).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  confirmDuplicate: z.boolean().optional(),
  overrideFifo: z.boolean().optional(),
});

export async function paymentRoutes(app: FastifyInstance) {
  app.post("/api/payments", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const payment = await createPayment(parsed.data);
      return reply.code(201).send({ payment });
    } catch (err) {
      if (err instanceof SameAmountInProgressError) {
        return reply.code(409).send({
          error: "same_amount_in_progress",
          message:
            "A payment with this amount is already in progress. Confirm to start another.",
          existing: err.existing,
          requireConfirmDuplicate: true,
        });
      }
      if (err instanceof FifoSlotBusyError) {
        return reply.code(409).send({
          error: "fifo_slot_busy",
          message:
            "Single-slot FIFO: finish or expire the current payment, or pass overrideFifo/confirmDuplicate.",
          existing: err.existing,
          requireOverrideFifo: true,
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "create_failed", message });
    }
  });

  app.get("/api/alerts", async (req) => {
    const q = req.query as { unreadOnly?: string; limit?: string };
    return {
      alerts: listAlerts({
        unreadOnly: q.unreadOnly === "1" || q.unreadOnly === "true",
        limit: q.limit ? Number(q.limit) : 50,
      }),
      unreadCount: unreadAlertCount(),
    };
  });

  app.post("/api/alerts/:id/read", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = markAlertRead(id);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ok: true, unreadCount: unreadAlertCount() });
  });

  app.post("/api/alerts/:id/dismiss", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = dismissAlert(id);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ok: true, unreadCount: unreadAlertCount() });
  });

  app.post("/api/alerts/read-all", async () => {
    const updated = markAllAlertsRead();
    return { ok: true, updated, unreadCount: unreadAlertCount() };
  });

  app.get("/api/payments", async (req) => {
    const q = req.query as { status?: string; limit?: string };
    const payments = listPayments({
      status: q.status as never,
      limit: q.limit ? Number(q.limit) : 50,
    });
    return { payments };
  });

  app.get("/api/payments/pending", async () => {
    return { payments: listPendingConfirms() };
  });

  app.get("/api/payments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const payment = getPayment(id);
    if (!payment) return reply.code(404).send({ error: "not_found" });
    return { payment };
  });

  app.post("/api/payments/:id/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const payment = await merchantConfirm(id);
      return { payment, circuit: sideEffectBreaker.getStatus() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "confirm_failed", message });
    }
  });

  app.post("/api/payments/:id/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { reason?: string };
    try {
      const payment = await merchantReject(id, body.reason);
      return { payment };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "reject_failed", message });
    }
  });

  app.post("/api/payments/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const payment = await cancelPayment(id);
      return { payment };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "cancel_failed", message });
    }
  });

  app.get("/api/reports/tally", async (req) => {
    const q = req.query as { from?: string; to?: string };
    const to = q.to ?? new Date().toISOString();
    const from =
      q.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return { tally: getTally(from, to) };
  });

  app.get("/api/reports/gst-export", async (req) => {
    const q = req.query as { from?: string; to?: string };
    return gstExportStub(q.from ?? "", q.to ?? "");
  });

  app.post("/api/reports/reconciliation", async () => {
    return reconciliationStub();
  });

  app.get("/api/system/circuit", async () => {
    return { circuit: sideEffectBreaker.getStatus() };
  });
}
