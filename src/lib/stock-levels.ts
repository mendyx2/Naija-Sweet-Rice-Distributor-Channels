/**
 * Stock levels for the HQ stock tracker (pure rules, unit tested).
 * "Free" bags are on hand minus those held for unpaid orders.
 */
export type StockLevel = "OUT" | "LOW" | "OK";

/** Default "running low" level per bag size, used until HQ sets its own. */
export const defaultLowAt = (sizeKg: number) => (sizeKg >= 25 ? 5 : 10);

export function stockLevel(free: number, lowAt: number): StockLevel {
  if (free <= 0) return "OUT";
  if (free <= lowAt) return "LOW";
  return "OK";
}

/**
 * Which alert to send for one store and size, given what was already sent.
 * Each alert goes once; restocking above the level re-arms both.
 */
export function alertToSend(level: StockLevel, sent: { low: boolean; out: boolean }): "OUT" | "LOW" | "CLEAR" | null {
  if (level === "OUT") return sent.out ? null : "OUT";
  if (level === "LOW") return sent.low ? null : "LOW";
  return sent.low || sent.out ? "CLEAR" : null;
}
