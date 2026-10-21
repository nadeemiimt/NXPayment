import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { gmailOAuthConfigured } from "../services/email/gmail-adapter.js";

/**
 * Google OAuth callback for Gmail connect (local + hosted).
 *
 * Google Cloud Console — Authorized redirect URIs (local):
 *   http://127.0.0.1:3847/api/oauth/google/callback
 *   http://localhost:3847/api/oauth/google/callback
 *
 * Authorized JavaScript origins (web UI that starts connect):
 *   http://127.0.0.1:4321
 *   http://localhost:4321
 *
 * Token exchange (code → refresh_token) is deferred until GMAIL_CLIENT_* are set
 * and a live Gmail API adapter is wired; this route exists so Console URIs match.
 */
export async function oauthRoutes(app: FastifyInstance) {
  app.get("/api/oauth/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) {
      return reply.code(400).send({
        error: "oauth_denied",
        detail: q.error,
        redirectUri: config.gmailRedirectUri,
      });
    }
    if (!q.code) {
      return reply.code(400).send({
        error: "missing_code",
        hint: "Register this exact redirect URI in Google Cloud Console",
        redirectUri: config.gmailRedirectUri,
        javascriptOrigins: [
          "http://127.0.0.1:4321",
          "http://localhost:4321",
        ],
      });
    }
    if (!gmailOAuthConfigured()) {
      return reply.code(503).send({
        error: "gmail_oauth_not_configured",
        message:
          "Configure Gmail OAuth Client ID/Secret in Merchant Auto-confirm (or set GMAIL_CLIENT_ID/SECRET env), then reconnect. Callback URI is ready.",
        redirectUri: config.gmailRedirectUri,
      });
    }
    // Live code→token exchange lands with Gmail API adapter; acknowledge receipt for now.
    return {
      ok: true,
      provider: "gmail",
      receivedCode: true,
      state: q.state ?? null,
      redirectUri: config.gmailRedirectUri,
      note: "OAuth callback registered. Exchange code for refresh_token in gmail-adapter when live polling is enabled.",
    };
  });
}
