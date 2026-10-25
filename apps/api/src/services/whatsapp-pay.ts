/**
 * Merchant → buyer WhatsApp payment invite (amount, merchant, UPI link, QR image).
 * Meta Cloud when WHATSAPP_TOKEN + WHATSAPP_PHONE_ID set; otherwise dry-run stub.
 */
import QRCode from "qrcode";
import { formatInr, paiseToRupees } from "../../../../packages/shared/src/index.ts";
import { getPayment } from "./payments.js";
import { getMerchantConfig } from "./merchant.js";
import {
  metaGraphJson,
  normalizeE164,
  whatsappConfigured,
  whatsappCreds,
} from "./whatsapp-meta.js";
import { recordWhatsAppOutbound } from "./whatsapp-audit.js";

export interface WhatsAppPayInviteResult {
  ok: boolean;
  mode: "stub" | "meta_cloud";
  auditId: string;
  messageId?: string;
  detail: string;
  /** Dry-run only — safe payload for local UI preview (includes QR base64). */
  stubPayload?: {
    to: string;
    text: string;
    upiUri: string;
    amountInr: string;
    merchantName: string;
    qrPngBase64: string;
  };
}

async function renderUpiQrPngBase64(upiUri: string): Promise<string> {
  const buf = await QRCode.toBuffer(upiUri, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return buf.toString("base64");
}

function buildInviteText(input: {
  merchantName: string;
  amountPaise: number;
  upiUri: string;
  note?: string | null;
}): string {
  const amount = formatInr(input.amountPaise);
  const lines = [
    `NXPayment — pay ${input.merchantName}`,
    `Amount: ${amount}`,
  ];
  if (input.note) lines.push(`Note: ${input.note}`);
  lines.push(`UPI link: ${input.upiUri}`);
  lines.push("Scan the QR in this chat, or open the UPI link on your phone.");
  return lines.join("\n");
}

async function uploadMetaMedia(
  phoneId: string,
  pngBase64: string
): Promise<{ ok: boolean; mediaId?: string; detail: string }> {
  const { token } = whatsappCreds();
  const binary = Buffer.from(pngBase64, "base64");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "image/png");
  form.append(
    "file",
    new Blob([new Uint8Array(binary)], { type: "image/png" }),
    "upi-qr.png"
  );

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.id) {
      return {
        ok: false,
        detail: data.error?.message ?? `Media upload HTTP ${res.status}`,
      };
    }
    return { ok: true, mediaId: data.id, detail: "Media uploaded" };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendMetaImageCaption(input: {
  toE164: string;
  caption: string;
  mediaId: string;
}): Promise<{ ok: boolean; messageId?: string; detail: string }> {
  const { phoneId } = whatsappCreds();
  const to = input.toE164.replace(/^\+/, "");
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: {
      id: input.mediaId,
      caption: input.caption.slice(0, 1024),
    },
  };
  try {
    const res = await metaGraphJson(`${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = res.data.error as { message?: string } | undefined;
      return {
        ok: false,
        detail: err?.message ?? `Meta send HTTP ${res.status}`,
      };
    }
    const messages = res.data.messages as Array<{ id?: string }> | undefined;
    return {
      ok: true,
      messageId: messages?.[0]?.id,
      detail: "Payment invite + QR sent via Meta Cloud",
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendWhatsAppPayInvite(input: {
  paymentId: string;
  phoneE164: string;
}): Promise<WhatsAppPayInviteResult> {
  const payment = getPayment(input.paymentId);
  if (!payment) {
    throw new Error("Payment not found");
  }
  if (!["INITIATED", "ACTIVE", "PROCESSING"].includes(payment.status)) {
    throw new Error(`Payment is ${payment.status} — invite only for in-progress payments`);
  }

  const phone = normalizeE164(input.phoneE164);
  const merchant = getMerchantConfig();
  const merchantName =
    merchant.displayName?.trim() ||
    payment.receivingName ||
    merchant.brandName ||
    "Merchant";
  const text = buildInviteText({
    merchantName,
    amountPaise: payment.amountPaise,
    upiUri: payment.upiUri,
    note: payment.note,
  });
  const qrPngBase64 = await renderUpiQrPngBase64(payment.upiUri);
  const amountInr = paiseToRupees(payment.amountPaise).toFixed(2);

  if (!whatsappConfigured()) {
    const auditId = recordWhatsAppOutbound({
      kind: "payment_invite",
      paymentId: payment.id,
      toPhoneE164: phone,
      mode: "stub",
      ok: true,
      detail: `Dry-run payment invite ${formatInr(payment.amountPaise)} → ${phone}`,
    });
    return {
      ok: true,
      mode: "stub",
      auditId,
      detail:
        "Dry-run: WhatsApp payment invite not sent. Set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID for live Meta Cloud. Stub payload shown below.",
      stubPayload: {
        to: phone,
        text,
        upiUri: payment.upiUri,
        amountInr,
        merchantName,
        qrPngBase64,
      },
    };
  }

  const { phoneId } = whatsappCreds();
  const uploaded = await uploadMetaMedia(phoneId, qrPngBase64);
  if (!uploaded.ok || !uploaded.mediaId) {
    const auditId = recordWhatsAppOutbound({
      kind: "payment_invite",
      paymentId: payment.id,
      toPhoneE164: phone,
      mode: "meta_cloud",
      ok: false,
      detail: uploaded.detail,
    });
    return {
      ok: false,
      mode: "meta_cloud",
      auditId,
      detail: uploaded.detail,
    };
  }

  const sent = await sendMetaImageCaption({
    toE164: phone,
    caption: text,
    mediaId: uploaded.mediaId,
  });
  const auditId = recordWhatsAppOutbound({
    kind: "payment_invite",
    paymentId: payment.id,
    toPhoneE164: phone,
    mode: "meta_cloud",
    ok: sent.ok,
    messageId: sent.messageId ?? null,
    detail: sent.detail,
  });
  return {
    ok: sent.ok,
    mode: "meta_cloud",
    auditId,
    messageId: sent.messageId,
    detail: sent.detail,
  };
}
