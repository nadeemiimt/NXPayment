import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AgentAuthError,
  authenticateAgentBearer,
} from "../services/agent-keys.js";
import {
  SameAmountInProgressError,
  agentConfirmPayment,
  agentCreatePayment,
  agentGetPayment,
  agentListCatalog,
  agentQuoteCart,
} from "../services/agent-commerce.js";
import { agentOpenApiDocument } from "../services/agent-openapi.js";

function authOrReply(req: FastifyRequest, reply: FastifyReply) {
  try {
    return authenticateAgentBearer(req.headers.authorization);
  } catch (err) {
    if (err instanceof AgentAuthError) {
      const status =
        err.code === "agents_disabled"
          ? 403
          : err.code === "missing_key"
            ? 401
            : 401;
      reply.code(status).send({ error: err.code, message: err.message });
      return null;
    }
    throw err;
  }
}

export async function agentRoutes(app: FastifyInstance) {
  app.get("/api/agent/v1/openapi.json", async () => agentOpenApiDocument());

  app.get("/api/agent/v1/catalog", async (req, reply) => {
    if (!authOrReply(req, reply)) return;
    const q = req.query as {
      shopId?: string;
      page?: string;
      pageSize?: string;
      q?: string;
    };
    try {
      return agentListCatalog({
        shopId: q.shopId,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
        q: q.q,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "catalog_failed", message });
    }
  });

  app.post("/api/agent/v1/quote", async (req, reply) => {
    if (!authOrReply(req, reply)) return;
    const parsed = z
      .object({
        shopId: z.string().optional(),
        lines: z
          .array(
            z.object({
              itemId: z.string().min(1),
              qty: z.number().positive(),
            })
          )
          .min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      return { quote: agentQuoteCart(parsed.data) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "quote_failed", message });
    }
  });

  app.post("/api/agent/v1/payments", async (req, reply) => {
    if (!authOrReply(req, reply)) return;
    const parsed = z
      .object({
        amountPaise: z.number().int().positive().optional(),
        lines: z
          .array(
            z.object({
              itemId: z.string().min(1),
              qty: z.number().positive(),
            })
          )
          .optional(),
        shopId: z.string().optional(),
        note: z.string().max(256).optional(),
        merchantOrderId: z.string().max(128).optional(),
        idempotencyKey: z.string().min(8).max(128).optional(),
        confirmDuplicate: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const result = await agentCreatePayment(parsed.data);
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof SameAmountInProgressError) {
        return reply.code(409).send({
          error: "same_amount_in_progress",
          message: err.message,
          existing: err.existing,
          requireConfirmDuplicate: true,
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "create_failed", message });
    }
  });

  app.get("/api/agent/v1/payments/:id", async (req, reply) => {
    if (!authOrReply(req, reply)) return;
    const { id } = req.params as { id: string };
    const result = await agentGetPayment(id);
    if (!result) return reply.code(404).send({ error: "not_found" });
    return result;
  });

  app.post("/api/agent/v1/payments/:id/confirm", async (req, reply) => {
    if (!authOrReply(req, reply)) return;
    const { id } = req.params as { id: string };
    try {
      const payment = await agentConfirmPayment(id);
      return { payment };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "confirm_failed", message });
    }
  });
}
