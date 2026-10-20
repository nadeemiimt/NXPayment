import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { getDb } from "./db/schema.js";
import { merchantRoutes } from "./routes/merchant.js";
import { paymentRoutes } from "./routes/payments.js";

/** Build the Fastify app without listening (used by server + integration tests). */
export async function buildApp(opts?: {
  logger?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts?.logger ?? true,
  });

  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
    // Default @fastify/cors can omit PUT; browser onboarding uses PUT /api/merchant/config
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });
  await app.register(sensible);

  // Accept empty bodies with Content-Type: application/json (browser POSTs often omit `{}`)
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      const raw = typeof body === "string" ? body : "";
      if (!raw || !raw.trim()) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  getDb();

  app.get("/health", async () => ({ ok: true, service: "nxpayment-api" }));

  await app.register(paymentRoutes);
  await app.register(merchantRoutes);

  return app;
}
