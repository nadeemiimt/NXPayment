import type { EmailCreditMessage, MailboxAdapter } from "./types.js";

/** In-memory mailbox for dev: POST /api/credits/email/ingest pushes samples here. */
const inbox: EmailCreditMessage[] = [];

export function pushMockEmail(msg: Omit<EmailCreditMessage, "id"> & { id?: string }) {
  const full: EmailCreditMessage = {
    id: msg.id ?? `mock-${Date.now()}`,
    subject: msg.subject,
    from: msg.from,
    bodyText: msg.bodyText,
    receivedAt: msg.receivedAt,
  };
  inbox.unshift(full);
  return full;
}

export function clearMockInbox() {
  inbox.length = 0;
}

export class MockMailboxAdapter implements MailboxAdapter {
  readonly id = "mock" as const;

  async fetchRecentCredits(): Promise<EmailCreditMessage[]> {
    return [...inbox];
  }
}
