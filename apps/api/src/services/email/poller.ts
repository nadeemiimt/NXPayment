import { parseBankEmail } from "../bank-alert-parser.js";
import { observeCredit } from "../credit-matcher.js";
import { getEmailCredentials, getMerchantConfig } from "../merchant.js";
import { GmailMailboxAdapter } from "./gmail-adapter.js";
import { YahooMailboxAdapter } from "./yahoo-adapter.js";
import { MockMailboxAdapter } from "./mock-adapter.js";
import type { MailboxAdapter } from "./types.js";

const seenMessageIds = new Set<string>();

function resolveAdapter(): MailboxAdapter | null {
  const creds = getEmailCredentials();
  if (!creds.provider || !creds.emailAddress) return null;
  if (creds.provider === "mock") return new MockMailboxAdapter();
  if (creds.provider === "gmail" && creds.secret) {
    return new GmailMailboxAdapter(creds.emailAddress, creds.secret);
  }
  if (creds.provider === "yahoo" && creds.secret) {
    return new YahooMailboxAdapter(creds.emailAddress, creds.secret);
  }
  return null;
}

export async function pollEmailCreditsOnce(): Promise<{
  scanned: number;
  confirmed: number;
  skipped: number;
}> {
  const merchant = getMerchantConfig();
  if (!merchant.autoConfirmEnabled || !merchant.emailAutoConfirm) {
    return { scanned: 0, confirmed: 0, skipped: 0 };
  }
  const adapter = resolveAdapter();
  if (!adapter) return { scanned: 0, confirmed: 0, skipped: 0 };

  const messages = await adapter.fetchRecentCredits();
  let confirmed = 0;
  let skipped = 0;

  for (const msg of messages) {
    if (seenMessageIds.has(msg.id)) {
      skipped += 1;
      continue;
    }
    seenMessageIds.add(msg.id);
    if (seenMessageIds.size > 500) {
      const first = seenMessageIds.values().next().value as string;
      seenMessageIds.delete(first);
    }

    const parsed = parseBankEmail({
      subject: msg.subject,
      body: msg.bodyText,
      from: msg.from,
      date: msg.receivedAt,
    });
    if (!parsed?.amountPaise) {
      skipped += 1;
      continue;
    }

    const source =
      adapter.id === "gmail"
        ? "email_gmail"
        : adapter.id === "yahoo"
          ? "email_yahoo"
          : "email_mock";

    const result = await observeCredit({
      amountPaise: parsed.amountPaise,
      utr: parsed.bankReferenceNumber,
      subject: msg.subject,
      rawText: msg.bodyText,
      source,
      observedAt: msg.receivedAt,
    });
    if (result.outcome === "confirmed") confirmed += 1;
    else skipped += 1;
  }

  return { scanned: messages.length, confirmed, skipped };
}
