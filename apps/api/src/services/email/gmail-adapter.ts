import { config } from "../../config.js";
import type { EmailCreditMessage, MailboxAdapter } from "./types.js";

/**
 * Gmail adapter — OAuth when GMAIL_CLIENT_ID/SECRET are set; otherwise
 * treats `secret` as an app password / refresh token placeholder and returns [].
 * Live Gmail API listing is deferred until OAuth app credentials are configured.
 */
export class GmailMailboxAdapter implements MailboxAdapter {
  readonly id = "gmail" as const;

  constructor(
    private readonly emailAddress: string,
    private readonly secret: string
  ) {}

  async fetchRecentCredits(): Promise<EmailCreditMessage[]> {
    if (!config.gmailClientId || !config.gmailClientSecret) {
      // No OAuth app — skip live fetch; use mock ingest / IMAP yahoo path instead
      return [];
    }
    // Placeholder for Gmail API users.messages.list + get — requires OAuth consent.
    void this.emailAddress;
    void this.secret;
    return [];
  }
}

export function gmailOAuthConfigured(): boolean {
  return Boolean(config.gmailClientId && config.gmailClientSecret);
}
