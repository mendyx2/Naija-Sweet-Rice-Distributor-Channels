/**
 * Server-side order pricing. The client never decides amounts: checkout
 * always re-runs quote() against fresh prices from the database.
 */
import { perKgKobo } from "./money";

export type QuoteVariant = {
  id: string;
  sizeKg: number;
  retailPriceKobo: number | null;
  wholesalePriceKobo: number | null;
  stockQty: number;
  reservedQty: number;
  active: boolean;
};

export type QuoteZone = {
  id: string;
  name: string;
  kind: "PICKUP" | "ABUJA" | "NEARBY_TOWN" | "AREA";
  baseFeeKobo: number;
  perKgFeeKobo: number;
  minOrderKg: number | null;
  minOrderKobo: number | null;
  active: boolean;
};

export type QuoteCoupon = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxDiscountKobo: number | null;
  minOrderKobo: number;
  maxUses: number;
  usedCount: number;
  userId: string | null;
  startsAt: Date;
  expiresAt: Date | null;
};

export type QuoteLine = { variantId: string; qty: number };

export type QuoteInput = {
  lines: QuoteLine[];
  variants: QuoteVariant[];
  zone: QuoteZone;
  coupon?: QuoteCoupon | null;
  /** Approved sellers/resellers pay wholesale where a wholesale price is set. */
  wholesale?: boolean;
  userId?: string | null;
  now?: Date;
};

export type QuoteIssue =
  | { code: "EMPTY_CART" }
  | { code: "INVALID_QTY"; variantId: string }
  | { code: "UNKNOWN_VARIANT"; variantId: string }
  | { code: "NOT_FOR_SALE"; variantId: string }
  | { code: "OUT_OF_STOCK"; variantId: string; soldOut: boolean }
  | { code: "ZONE_UNAVAILABLE" }
  | { code: "BELOW_MIN_KG"; minKg: number; cartKg: number }
  | { code: "BELOW_MIN_VALUE"; minKobo: number; subtotalKobo: number };

export type CouponIssue =
  | "COUPON_NOT_STARTED"
  | "COUPON_EXPIRED"
  | "COUPON_USED_UP"
  | "COUPON_NOT_YOURS"
  | "COUPON_MIN_ORDER";

export type QuoteLineResult = {
  variantId: string;
  sizeKg: number;
  qty: number;
  unitPriceKobo: number;
  lineTotalKobo: number;
  perKgKobo: number;
};

export type Quote = {
  ok: boolean;
  issues: QuoteIssue[];
  couponIssue: CouponIssue | null;
  lines: QuoteLineResult[];
  totalKg: number;
  subtotalKobo: number;
  discountKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
};

const MAX_QTY_PER_LINE = 500;

export function deliveryFeeKobo(zone: QuoteZone, totalKg: number): number {
  if (zone.kind === "PICKUP") return 0;
  return zone.baseFeeKobo + zone.perKgFeeKobo * totalKg;
}

export function couponDiscountKobo(
  coupon: QuoteCoupon,
  subtotalKobo: number,
  opts: { userId?: string | null; now?: Date } = {},
): { discountKobo: number; issue: CouponIssue | null } {
  const now = opts.now ?? new Date();
  if (coupon.startsAt > now) return { discountKobo: 0, issue: "COUPON_NOT_STARTED" };
  if (coupon.expiresAt && coupon.expiresAt <= now) return { discountKobo: 0, issue: "COUPON_EXPIRED" };
  if (coupon.usedCount >= coupon.maxUses) return { discountKobo: 0, issue: "COUPON_USED_UP" };
  if (coupon.userId && coupon.userId !== opts.userId) return { discountKobo: 0, issue: "COUPON_NOT_YOURS" };
  if (subtotalKobo < coupon.minOrderKobo) return { discountKobo: 0, issue: "COUPON_MIN_ORDER" };

  let discount =
    coupon.type === "PERCENT"
      ? Math.floor((subtotalKobo * Math.min(Math.max(coupon.value, 0), 100)) / 100)
      : Math.max(coupon.value, 0);
  if (coupon.maxDiscountKobo != null) discount = Math.min(discount, coupon.maxDiscountKobo);
  // Coupons discount goods only, never below zero and never the delivery fee.
  return { discountKobo: Math.min(discount, subtotalKobo), issue: null };
}

export function quote(input: QuoteInput): Quote {
  const issues: QuoteIssue[] = [];
  const lines: QuoteLineResult[] = [];
  const byId = new Map(input.variants.map((v) => [v.id, v]));

  // Merge duplicate lines for the same variant.
  const merged = new Map<string, number>();
  for (const l of input.lines) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.qty);

  if (merged.size === 0) issues.push({ code: "EMPTY_CART" });

  for (const [variantId, qty] of merged) {
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      issues.push({ code: "INVALID_QTY", variantId });
      continue;
    }
    const v = byId.get(variantId);
    if (!v) {
      issues.push({ code: "UNKNOWN_VARIANT", variantId });
      continue;
    }
    const price =
      input.wholesale && v.wholesalePriceKobo != null ? v.wholesalePriceKobo : v.retailPriceKobo;
    if (!v.active || price == null) {
      issues.push({ code: "NOT_FOR_SALE", variantId });
      continue;
    }
    const available = Math.max(v.stockQty - v.reservedQty, 0);
    if (qty > available) issues.push({ code: "OUT_OF_STOCK", variantId, soldOut: available === 0 });
    lines.push({
      variantId,
      sizeKg: v.sizeKg,
      qty,
      unitPriceKobo: price,
      lineTotalKobo: price * qty,
      perKgKobo: perKgKobo(price, v.sizeKg),
    });
  }

  const totalKg = lines.reduce((s, l) => s + l.sizeKg * l.qty, 0);
  const subtotalKobo = lines.reduce((s, l) => s + l.lineTotalKobo, 0);

  const { zone } = input;
  if (!zone.active) issues.push({ code: "ZONE_UNAVAILABLE" });
  if (zone.minOrderKg != null && totalKg < zone.minOrderKg)
    issues.push({ code: "BELOW_MIN_KG", minKg: zone.minOrderKg, cartKg: totalKg });
  if (zone.minOrderKobo != null && subtotalKobo < zone.minOrderKobo)
    issues.push({ code: "BELOW_MIN_VALUE", minKobo: zone.minOrderKobo, subtotalKobo });

  let discountKobo = 0;
  let couponIssue: CouponIssue | null = null;
  if (input.coupon) {
    const r = couponDiscountKobo(input.coupon, subtotalKobo, { userId: input.userId, now: input.now });
    discountKobo = r.discountKobo;
    couponIssue = r.issue;
  }

  const fee = deliveryFeeKobo(zone, totalKg);
  return {
    ok: issues.length === 0,
    issues,
    couponIssue,
    lines,
    totalKg,
    subtotalKobo,
    discountKobo,
    deliveryFeeKobo: fee,
    totalKobo: subtotalKobo - discountKobo + fee,
  };
}

/** Plain-English message for a quote issue (shown in cart / checkout). */
export function describeIssue(issue: QuoteIssue, fmt: (kobo: number) => string): string {
  switch (issue.code) {
    case "EMPTY_CART":
      return "Your cart is empty.";
    case "INVALID_QTY":
      return "Please choose a valid quantity.";
    case "UNKNOWN_VARIANT":
    case "NOT_FOR_SALE":
      return "One of the items in your cart is no longer available.";
    case "OUT_OF_STOCK":
      return issue.soldOut
        ? "One of the sizes in your cart is currently unavailable at this store. Remove it, or order it from Naija Sweet Rice HQ."
        : "One size isn't available in that quantity at this store. Please reduce the quantity, or order from Naija Sweet Rice HQ.";
    case "ZONE_UNAVAILABLE":
      return "We are not delivering to this area at the moment.";
    case "BELOW_MIN_KG":
      return `Delivery to this area needs a minimum order of ${issue.minKg}kg (your cart: ${issue.cartKg}kg).`;
    case "BELOW_MIN_VALUE":
      return `Delivery to this area needs a minimum order of ${fmt(issue.minKobo)}.`;
  }
}
