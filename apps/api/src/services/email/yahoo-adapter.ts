import { config } from "../../config.js";
import type { EmailCreditMessage, MailboxAdapter } from "./types.js";

/**
 * Yahoo adapter — prefers IMAP app-password when YAHOO_IMAP_HOST is set.
 * Full OAuth deferred (YAHOO_CLIENT_ID). Without IMAP deps installed we no-op.
 */
export class YahooMailboxAdapter implements MailboxAdapter {
  readonly id = "yahoo" as const;

  constructor(
    private readonly emailAddress: string,
    private readonly appPassword: string
  ) {}

  async fetchRecentCredits(): Promise<EmailCreditMessage[]> {
    if (!config.yahooImapHost) {
      void this.emailAddress;
      void this.appPassword;
      return [];
    }
    // IMAP fetch would go here (e.g. imapflow). Kept as adapter seam for now.
    return [];
  }
}

export function yahooOAuthConfigured(): boolean {
  return Boolean(config.yahooClientId && config.yahooClientSecret);
}
