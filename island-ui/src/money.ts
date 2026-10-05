// Subunit money: integer cents end to end, never a float.
// Port of island/gigs.py money_cents (same strings, same shape).
export function moneyCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("cents must be int");
  const neg = cents < 0;
  const a = Math.abs(cents);
  const digits = String(Math.floor(a / 100));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return `${neg ? "-R " : "R "}${out},${String(a % 100).padStart(2, "0")}`;
}

export type GigOrigin = "native" | "remotiveSeed";

export interface GigListing {
  id: string;
  title: string;
  origin: GigOrigin;
  pay_cents: number | null;
  pay_text?: string | null;
  attribution?: string | null;
  seeded_at?: number | null;
  category?: string;
  location?: string;
  remote?: boolean;
  money?: string;
}

/// Exact cents render, or the seed text verbatim. Never a float.
export function moneyLine(g: GigListing): string {
  if (g.money) return g.money;
  if (g.pay_cents !== null && g.pay_cents !== undefined) {
    return moneyCents(g.pay_cents);
  }
  return g.pay_text || "Pay on application";
}
