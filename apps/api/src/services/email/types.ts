export interface EmailCreditMessage {
  id: string;
  subject: string;
  from: string;
  bodyText: string;
  receivedAt: string;
}

export interface MailboxAdapter {
  readonly id: "gmail" | "yahoo" | "mock";
  /** Fetch recent likely credit notifications. */
  fetchRecentCredits(): Promise<EmailCreditMessage[]>;
}
