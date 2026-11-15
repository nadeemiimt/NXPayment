import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDisplaySession,
  getDisplaySession,
  getDisplayState,
  listDisplaySessions,
} from "../services/display.js";

export async function displayRoutes(app: FastifyInstance) {
  app.get("/api/merchant/display-sessions", async () => {
    return { sessions: listDisplaySessions() };
  });

  app.post("/api/merchant/display-sessions", async (req, reply) => {
    const parsed = z
      .object({
        shopId: z.string().nullable().optional(),
        label: z.string().max(64).nullable().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const session = createDisplaySession(parsed.data);
      return reply.code(201).send({ session });
    } catch (err) {
      return reply.code(400).send({ error: "create_failed", message: (err as Error).message });
    }
  });

  app.get("/api/display/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const state = getDisplayState(code);
    if (!state) return reply.code(404).send({ error: "not_found" });
    return { display: state };
  });

  app.get("/api/display/:code/session", async (req, reply) => {
    const { code } = req.params as { code: string };
    const session = getDisplaySession(code);
    if (!session) return reply.code(404).send({ error: "not_found" });
    return { session };
  });
}
