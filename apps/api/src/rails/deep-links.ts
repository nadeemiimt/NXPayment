/** Build common UPI app deep links from a standard upi:// URI. */
export function buildUpiDeepLinks(upiUri: string): Record<string, string> {
  const q = upiUri.includes("?") ? upiUri.slice(upiUri.indexOf("?") + 1) : "";
  return {
    upi: upiUri,
    gpay: `gpay://upi/pay?${q}`,
    phonepe: `phonepe://pay?${q}`,
    paytm: `paytmmp://pay?${q}`,
  };
}
