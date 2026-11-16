/**
 * Pure rules for the distributor network (unit tested; no database access).
 */

export type OfferVariant = {
  variantId: string;
  sizeKg: number;
  retailPriceKobo: number | null;
  wholesalePriceKobo: number | null;
  available: number;
  active: boolean;
};

export type OfferFee = {
  baseFeeKobo: number;
  perKgFeeKobo: number;
  minOrderKg: number | null;
  minOrderKobo: number | null;
  etaHours: number | null;
  terms: string | null;
};

export type Offer = {
  distributorId: string;
  slug: string;
  name: string;
  isHq: boolean;
  ready: boolean; // approved, active and has bank details
  address: string | null;
  hours: string | null;
  pickup: boolean; // customers can collect from the store
  joinsHqPromotions: boolean;
  fee: OfferFee | null; // delivery fee into the chosen area; null = the store doesn't deliver there
  variants: OfferVariant[];
};

/** Is a distributor price inside HQ's range? (null bound = no limit on that side) */
export function withinBand(price: number | null, min: number | null, max: number | null): boolean {
  if (price == null) return false;
  if (min != null && price < min) return false;
  if (max != null && price > max) return false;
  return true;
}

/** Can this store supply every line (priced, active, enough stock)? */
export function canFill(offer: Offer | null, lines: { variantId: string; qty: number }[], wholesale = false): boolean {
  if (!offer?.ready) return false;
  return lines.every((l) => {
    const v = offer.variants.find((x) => x.variantId === l.variantId);
    const price = v && (wholesale && v.wholesalePriceKobo != null ? v.wholesalePriceKobo : v.retailPriceKobo);
    return !!v && v.active && price != null && v.available >= l.qty;
  });
}

/**
 * Order of the store list a customer sees for their area: stores that have the
 * chosen size in stock first, then the lowest price for it, then the lowest
 * delivery fee, then by name. No store is favoured, HQ included.
 */
export function sortStores(stores: Offer[], variantId?: string | null): Offer[] {
  const price = (o: Offer) => o.variants.find((v) => v.variantId === variantId)?.retailPriceKobo ?? Number.MAX_SAFE_INTEGER;
  const inStock = (o: Offer) => {
    const v = variantId ? o.variants.find((x) => x.variantId === variantId) : null;
    return variantId ? !!v && v.active && v.retailPriceKobo != null && v.available > 0 : o.variants.some((x) => x.available > 0 && x.retailPriceKobo != null);
  };
  return [...stores].sort((a, b) =>
    Number(inStock(b)) - Number(inStock(a))
    || price(a) - price(b)
    || (a.fee?.baseFeeKobo ?? Number.MAX_SAFE_INTEGER) - (b.fee?.baseFeeKobo ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name));
}

export type CouponStoreIssue = "COUPON_WRONG_SELLER" | "COUPON_STORE_NOT_IN_PROMO";

/**
 * Which coupons a store accepts. A store's own codes work only at that store.
 * HQ codes and points coupons (paid for by HQ) work at HQ and at stores that
 * have chosen to take part in HQ promotions.
 */
export function couponStoreIssue(
  coupon: { distributorId: string | null },
  store: { distributorId: string; isHq: boolean; joinsHqPromotions: boolean },
): CouponStoreIssue | null {
  if (coupon.distributorId) return coupon.distributorId === store.distributorId ? null : "COUPON_WRONG_SELLER";
  return store.isHq || store.joinsHqPromotions ? null : "COUPON_STORE_NOT_IN_PROMO";
}

/** HQ fee owed on an order: fixed amount per bag (by size), only on distributor (non-HQ) sales. */
export function hqFeeFor(lines: { variantId: string; qty: number }[], feeByVariant: Map<string, number>, isHq: boolean): number {
  if (isHq) return 0;
  return lines.reduce((n, l) => n + (feeByVariant.get(l.variantId) ?? 0) * l.qty, 0);
}

export const PAYMENT_HOLD_HOURS = 3;
export const PAYMENT_REMINDER_HOURS = 2;
