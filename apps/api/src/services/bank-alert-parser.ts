/**
 * Bank SMS / Gmail credit-alert parser for NXPayment.
 *
 * Inspired by YouPI-PG (https://github.com/youpi-pg/YouPI-PG) patterns in:
 *   - apps/gmail-observer/src/parser.js  (BankEmailParser, extractIntelligentAmount)
 *   - apps/sms-observer/src/sms-parser.js (BankSmsParser)
 *
 * Clean reimplementation for NXPayment (number paise, no @youpi/common bigint).
 * YouPI appears to be a research project without a clear OSS license grant in-repo;
 * we do not vendor their source blobs.
 *
 * Product stance: Payment Verification = Bank SMS & Gmail alerts parsed in near
 * real time — NOT aggregator proprietary webhooks (Razorpay/Cashfree-style).
 */

export interface ParsedBankCredit {
  amountPaise: number;
  amount: string;
  bankReferenceNumber?: string;
  senderVpa?: string;
  observedAt: string;
  rawSnippet: string;
  channel: "sms" | "email" | "notification" | "unknown";
}

function toPaise(amountStr: string): number {
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n <= 0) throw new Error("invalid amount");
  return Math.round(n * 100);
}

/**
 * Multi-pattern INR amount extractor (YouPI-style prefix / suffix / proximity / decimal).
 */
export function extractIntelligentAmount(
  text: string
): { amountStr: string; amountPaise: number } | null {
  if (!text || typeof text !== "string") return null;

  const prefixMatch = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (prefixMatch?.[1]) {
    try {
      const clean = prefixMatch[1].replace(/,/g, "");
      return { amountStr: clean, amountPaise: toPaise(clean) };
    } catch {
      /* continue */
    }
  }

  const suffixMatch = text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i);
  if (suffixMatch?.[1]) {
    try {
      const clean = suffixMatch[1].replace(/,/g, "");
      return { amountStr: clean, amountPaise: toPaise(clean) };
    } catch {
      /* continue */
    }
  }

  const creditProximityMatch = text.match(
    /(?:credited|received|deposit|payment|paid|transferred|upi|cr)[\s\w:]*?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)[\s\w:]*?(?:credited|received|deposit|payment|paid|transferred|upi|cr)/i
  );
  if (creditProximityMatch) {
    const rawVal = creditProximityMatch[1] || creditProximityMatch[2];
    if (rawVal) {
      const clean = rawVal.replace(/,/g, "");
      if (/^\d+(\.\d{1,2})?$/.test(clean) && Number(clean) < 10_000_000 && Number(clean) > 0) {
        try {
          return { amountStr: clean, amountPaise: toPaise(clean) };
        } catch {
          /* continue */
        }
      }
    }
  }

  const standaloneDecimal = text.match(/\b(\d{1,6}\.\d{2})\b/);
  if (standaloneDecimal?.[1]) {
    try {
      const clean = standaloneDecimal[1];
      return { amountStr: clean, amountPaise: toPaise(clean) };
    } catch {
      /* continue */
    }
  }

  return null;
}

function isCreditAlert(text: string): boolean {
  const creditKeywords =
    /(credited|received|deposit|payment received|payment|upi\/cr|transferred)/i;
  if (!creditKeywords.test(text)) return false;
  if (
    /(debited|withdrawn|sent rs|paid rs)/i.test(text) &&
    !/(credited|received|deposit)/i.test(text)
  ) {
    return false;
  }
  return true;
}

function extractBankRef(text: string): string | undefined {
  const refMatch = text.match(
    /(?:utr|ref(?:\s*no)?|txn(?:\s*id)?|rrn)[:\s#]+([a-zA-Z0-9\-_]{6,35})/i
  );
  if (refMatch?.[1]) return refMatch[1].trim();
  const upiCrMatch = text.match(/UPI\/CR\/([a-zA-Z0-9\-_]+)/i);
  if (upiCrMatch?.[1]) return upiCrMatch[1].trim();
  return undefined;
}

function extractSenderVpa(text: string, loose = false): string | undefined {
  let vpaMatch = text.match(
    /(?:from|by)\s+([a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9.\-_]{2,64})/i
  );
  if (!vpaMatch && loose) {
    vpaMatch = text.match(/([a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9.\-_]{2,64})/i);
  }
  if (vpaMatch?.[1]) return vpaMatch[1].trim().replace(/[.,;]+$/, "");
  return undefined;
}

/** Gmail / bank-alert email → credit observation (YouPI BankEmailParser-inspired). */
export function parseBankEmail(email: {
  subject?: string;
  body?: string;
  from?: string;
  date?: string | Date;
}): ParsedBankCredit | null {
  const combinedText = `${email.subject || ""} ${email.body || ""}`.trim();
  if (!combinedText || !isCreditAlert(combinedText)) return null;

  const extracted = extractIntelligentAmount(combinedText);
  if (!extracted) return null;

  let observedAt = new Date().toISOString();
  if (email.date) {
    const d = new Date(email.date);
    if (!Number.isNaN(d.getTime())) observedAt = d.toISOString();
  }

  return {
    amountPaise: extracted.amountPaise,
    amount: extracted.amountStr,
    bankReferenceNumber: extractBankRef(combinedText),
    senderVpa: extractSenderVpa(combinedText),
    observedAt,
    rawSnippet: combinedText.slice(0, 300),
    channel: "email",
  };
}

/** Bank / UPI SMS → credit observation (YouPI BankSmsParser-inspired). */
export function parseBankSms(sms: {
  text: string;
  sender?: string;
  timestamp?: string | number | Date;
}): ParsedBankCredit | null {
  const text = (sms.text || "").trim();
  if (!text || !isCreditAlert(text)) return null;

  const extracted = extractIntelligentAmount(text);
  if (!extracted) return null;

  let observedAt = new Date().toISOString();
  if (sms.timestamp) {
    const d = new Date(sms.timestamp);
    if (!Number.isNaN(d.getTime())) observedAt = d.toISOString();
  }

  return {
    amountPaise: extracted.amountPaise,
    amount: extracted.amountStr,
    bankReferenceNumber: extractBankRef(text),
    senderVpa: extractSenderVpa(text, true),
    observedAt,
    rawSnippet: text.slice(0, 300),
    channel: "sms",
  };
}

/** Android notification text (same credit patterns as SMS). */
export function parseBankNotification(rawText: string): ParsedBankCredit | null {
  const parsed = parseBankSms({ text: rawText });
  if (!parsed) return null;
  return { ...parsed, channel: "notification" };
}

/** Back-compat helper used by credit-matcher / poller. */
export function parseCreditText(rawText: string): {
  amountPaise?: number;
  utr?: string;
  senderVpa?: string;
} {
  const emailLike = parseBankEmail({ subject: "", body: rawText });
  const smsLike = emailLike ?? parseBankSms({ text: rawText });
  if (!smsLike) return {};
  return {
    amountPaise: smsLike.amountPaise,
    utr: smsLike.bankReferenceNumber,
    senderVpa: smsLike.senderVpa,
  };
}
