import type { EmailCreditMessage, MailboxAdapter } from "./types.js";
import { getGmailOAuthCredentials } from "../gmail-oauth-credentials.js";

/**
 * Gmail adapter — OAuth when merchant DB or env GMAIL_CLIENT_ID/SECRET are set;
 * otherwise treats `secret` as an app password / refresh token placeholder and returns [].
 * Live Gmail API listing is deferred until OAuth app credentials are configured.
 */
export class GmailMailboxAdapter implements MailboxAdapter {
  readonly id = "gmail" as const;

  constructor(
    private readonly emailAddress: string,
    private readonly secret: string
  ) {}

  async fetchRecentCredits(): Promise<EmailCreditMessage[]> {
    const { clientId, clientSecret } = getGmailOAuthCredentials();
    if (!clientId || !clientSecret) {
      // No OAuth app — skip live fetch; use mock ingest / IMAP yahoo path instead
      return [];
    }
    // Placeholder for Gmail API users.messages.list + get — requires OAuth consent.
    void this.emailAddress;
    void this.secret;
    void clientId;
    void clientSecret;
    return [];
  }
}

/** True when DB-stored merchant credentials or env fallback are present. */
export function gmailOAuthConfigured(): boolean {
  const { clientId, clientSecret } = getGmailOAuthCredentials();
  return Boolean(clientId && clientSecret);
}
