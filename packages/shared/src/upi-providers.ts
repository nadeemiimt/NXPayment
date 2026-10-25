/**
 * India UPI app deep-link / Android intent helpers.
 * Patterns follow common YouPI / NPCI intent conventions (reimplemented cleanly).
 */

export type UpiProviderId = "phonepe" | "gpay" | "paytm" | "generic";

export interface UpiProviderLink {
  id: UpiProviderId;
  label: string;
  /** App-scheme deep link (iOS / installed-app handlers). */
  deepLink: string;
  /** Chrome Android intent URI targeting a specific package when set. */
  androidIntent: string;
  packageName?: string;
}

/** Extract query from `upi://pay?...` (or already a query string). */
export function parseUpiPayQuery(upiUri: string): URLSearchParams {
  const trimmed = upiUri.trim();
  if (trimmed.includes("?")) {
    return new URLSearchParams(trimmed.slice(trimmed.indexOf("?") + 1));
  }
  if (trimmed.includes("=")) {
    return new URLSearchParams(trimmed);
  }
  return new URLSearchParams();
}

function intentUri(qs: string, packageName?: string): string {
  const pkg = packageName ? `package=${packageName};` : "";
  return `intent://pay?${qs}#Intent;scheme=upi;${pkg}end`;
}

/** Build PhonePe / GPay / Paytm / generic open links from a merchant `upi://pay?...` URI. */
export function buildUpiProviderLinks(upiUri: string): UpiProviderLink[] {
  const params = parseUpiPayQuery(upiUri);
  const qs = params.toString();
  const generic =
    upiUri.trim().startsWith("upi://") ? upiUri.trim() : `upi://pay?${qs}`;

  return [
    {
      id: "phonepe",
      label: "PhonePe",
      deepLink: `phonepe://pay?${qs}`,
      androidIntent: intentUri(qs, "com.phonepe.app"),
      packageName: "com.phonepe.app",
    },
    {
      id: "gpay",
      label: "Google Pay",
      deepLink: `gpay://upi/pay?${qs}`,
      androidIntent: intentUri(qs, "com.google.android.apps.nbu.paisa.user"),
      packageName: "com.google.android.apps.nbu.paisa.user",
    },
    {
      id: "paytm",
      label: "Paytm",
      deepLink: `paytmmp://pay?${qs}`,
      androidIntent: intentUri(qs, "net.one97.paytm"),
      packageName: "net.one97.paytm",
    },
    {
      id: "generic",
      label: "Open UPI app",
      deepLink: generic,
      androidIntent: intentUri(qs),
    },
  ];
}

/** Pick the best href for the current UA (Android → intent, else app scheme / upi). */
export function resolveUpiLaunchHref(
  provider: UpiProviderLink,
  userAgent: string
): string {
  if (/Android/i.test(userAgent)) {
    return provider.androidIntent;
  }
  return provider.deepLink;
}
