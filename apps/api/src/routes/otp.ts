import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getMerchantConfig } from "../services/merchant.js";
import {
  createAndSendOtpChallenge,
  verifyOtpChallenge,
  whatsappOtpStatus,
} from "../services/whatsapp-otp.js";

const sendSchema = z.object({
  phoneE164: z.string().min(10).max(20),
  purpose: z.enum(["checkout_gate", "onboarding_gate"]),
});

const verifySchema = z.object({
  challengeId: z.string().min(8),
  code: z.string().min(4).max(8),
});

export async function otpRoutes(app: FastifyInstance) {
  app.get("/api/otp/whatsapp/status", async () => {
    const merchant = getMerchantConfig();
    return {
      ...whatsappOtpStatus(),
      gateEnabled: merchant.whatsappOtpEnabled,
      gatePhone: merchant.whatsappOtpPhone,
      onboardingVerifiedAt: merchant.whatsappVerifiedAt,
    };
  });

  app.post("/api/otp/whatsapp/send", async (req, reply) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const merchant = getMerchantConfig();
    if (
      parsed.data.purpose === "checkout_gate" &&
      !merchant.whatsappOtpEnabled
    ) {
      return reply.code(400).send({
        error: "otp_gate_disabled",
        message: "Enable WhatsApp OTP gate in merchant setup first.",
      });
    }
    try {
      const result = await createAndSendOtpChallenge(parsed.data);
      if (!result.ok) {
        return reply.code(502).send({ error: "send_failed", ...result });
      }
      return reply.code(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "send_failed", message });
    }
  });

  app.post("/api/otp/whatsapp/verify", async (req, reply) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const result = verifyOtpChallenge(parsed.data);
    if (!result.ok) {
      return reply.code(400).send({ error: "verify_failed", ...result });
    }
    return result;
  });
}
