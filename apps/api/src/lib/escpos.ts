/** Minimal ESC/POS helpers for 58mm/80mm thermal printers. */

const ESC = 0x1b;
const GS = 0x1d;

export type PaperWidthMm = 58 | 80;

/** Approximate character columns for common fonts. */
export function charsPerLine(widthMm: PaperWidthMm): number {
  return widthMm === 58 ? 32 : 48;
}

export function encodeEscPosReceipt(opts: {
  lines: string[];
  widthMm: PaperWidthMm;
  cut?: boolean;
}): Buffer {
  const chunks: number[] = [];
  // Initialize
  chunks.push(ESC, 0x40);
  // Align center for first pass — we manage alignment per line via spaces
  chunks.push(ESC, 0x61, 0x00); // left
  const width = charsPerLine(opts.widthMm);

  for (const raw of opts.lines) {
    const line = raw.length > width ? raw.slice(0, width) : raw;
    const bytes = Buffer.from(line + "\n", "utf8");
    for (const b of bytes) chunks.push(b);
  }

  chunks.push(0x0a, 0x0a);
  if (opts.cut !== false) {
    // Partial cut
    chunks.push(GS, 0x56, 0x01);
  }
  return Buffer.from(chunks);
}

export function centerLine(text: string, width: number): string {
  const t = text.trim();
  if (t.length >= width) return t.slice(0, width);
  const pad = Math.floor((width - t.length) / 2);
  return " ".repeat(pad) + t;
}

export function moneyLine(label: string, amountPaise: number, width: number): string {
  const amt = formatInrPlain(amountPaise);
  const gap = width - label.length - amt.length;
  if (gap <= 0) return `${label.slice(0, Math.max(0, width - amt.length - 1))} ${amt}`.slice(0, width);
  return label + " ".repeat(gap) + amt;
}

export function formatInrPlain(paise: number): string {
  return `Rs ${(paise / 100).toFixed(2)}`;
}

export function separator(width: number, ch = "-"): string {
  return ch.repeat(width);
}
