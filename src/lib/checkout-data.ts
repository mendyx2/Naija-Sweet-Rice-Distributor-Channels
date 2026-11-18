import "server-only";
import { db } from "./db";
import { quote, type Quote, type QuoteLine, type QuoteZone, type CouponIssue } from "./pricing";
import { offerFor } from "./network";
import { couponStoreIssue, type CouponStoreIssue, type Offer, type OfferFee } from "./network-rules";

export type CartViewLine = {
  variantId: string;
  productName: string;
  productSlug: string;
  sizeKg: number;
  imageUrl: string | null;
  qty: number;
  unitPriceKobo: number | null;
  /** The store has enough for this quantity. Stock levels themselves never reach the buyer. */
  enough: boolean;
  forSale: boolean;
};

export type FulfillmentChoice = "DELIVERY" | "PICKUP";

/** The store the customer is buying from. */
export type Fulfiller = {
  distributorId: string;
  slug: string;
  name: string;
  isHq: boolean;
  address: string | null;
  hours: string | null;
  pickup: boolean; // the store offers collection
  delivers: boolean; // the store delivers to the chosen area
  joinsHqPromotions: boolean;
};

export type StoreIssue = "NO_STORE" | "STORE_UNAVAILABLE" | "NO_DELIVERY_HERE" | "NO_PICKUP";

export type CartQuote = {
  lines: CartViewLine[];
  quote: Quote | null;
  zone: (Pick<QuoteZone, "id" | "name" | "kind"> & { terms: string | null }) | null;
  fulfiller: Fulfiller | null;
  fulfillment: FulfillmentChoice;
  storeIssue: StoreIssue | null;
  couponCode: string | null;
  couponIssue: CouponIssue | CouponStoreIssue | "COUPON_NOT_FOUND" | null;
};

const MAX_LINES = 20;
const NO_FEE: OfferFee = { baseFeeKobo: 0, perKgFeeKobo: 0, minOrderKg: null, minOrderKobo: null, etaHours: null, terms: null };

export const toFulfiller = (o: Offer): Fulfiller => ({
  distributorId: o.distributorId, slug: o.slug, name: o.name, isHq: o.isHq, address: o.address, hours: o.hours,
  pickup: o.pickup, delivers: !!o.fee, joinsHqPromotions: o.joinsHqPromotions,
});

/**
 * Prices the cart at the store the customer chose: that store's prices, stock
 * and delivery fee into their area (or no fee for pickup at the store). Used by
 * the cart, checkout and order creation, so the browser never decides amounts.
 */
export async function priceCart(opts: {
  lines: QuoteLine[];
  zoneId?: string | null;
  storeId?: string | null;
  fulfillment?: FulfillmentChoice | null;
  couponCode?: string | null;
  userId?: string | null;
  wholesale?: boolean;
}): Promise<CartQuote> {
  const lines = opts.lines
    .filter((l) => typeof l.variantId === "string" && l.variantId.length < 40)
    .slice(0, MAX_LINES);
  const fulfillment: FulfillmentChoice = opts.fulfillment === "PICKUP" ? "PICKUP" : "DELIVERY";
  const [variants, chosen] = await Promise.all([
    db.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: true } }),
    opts.storeId ? offerFor(opts.storeId, opts.zoneId ?? null) : opts.zoneId ? offerFor("", opts.zoneId) : Promise.resolve({ zone: null, offer: null }),
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const known = lines.filter((l) => byId.has(l.variantId));
  const zone = chosen.zone && chosen.zone.active ? chosen.zone : null;
  const offer = chosen.offer?.ready ? chosen.offer : null;

  const storeIssue: StoreIssue | null =
    !opts.storeId ? "NO_STORE"
    : !offer ? "STORE_UNAVAILABLE"
    : fulfillment === "PICKUP" ? (offer.pickup ? null : "NO_PICKUP")
    : zone && !offer.fee ? "NO_DELIVERY_HERE"
    : null;

  const ov = new Map((offer?.variants ?? []).map((v) => [v.variantId, v]));
  const view: CartViewLine[] = known.map((l) => {
    const v = byId.get(l.variantId)!;
    const o = ov.get(v.id);
    const price = o && (opts.wholesale && o.wholesalePriceKobo != null ? o.wholesalePriceKobo : o.retailPriceKobo);
    return {
      variantId: v.id,
      productName: v.product.name,
      productSlug: v.product.slug,
      sizeKg: v.sizeKg,
      imageUrl: v.imageUrl,
      qty: l.qty,
      unitPriceKobo: price ?? null,
      enough: (o?.available ?? 0) >= l.qty,
      forSale: !!o?.active && price != null,
    };
  });

  const code = opts.couponCode?.trim().toUpperCase() || null;
  const found = code ? await db.coupon.findUnique({ where: { code } }) : null;
  const storeCouponIssue = found && offer ? couponStoreIssue(found, offer) : null;
  const coupon = storeCouponIssue ? null : found;

  if (!offer) {
    return {
      lines: view, quote: null, fulfillment, storeIssue, couponCode: code, couponIssue: code && !found ? "COUPON_NOT_FOUND" : null,
      zone: zone ? { id: zone.id, name: zone.name, kind: zone.kind, terms: zone.terms } : null, fulfiller: null,
    };
  }

  // Pickup: no delivery fee or minimum order. Before an area is chosen: goods and discount only.
  const pickup = fulfillment === "PICKUP";
  const fee = pickup || !zone ? NO_FEE : offer.fee ?? NO_FEE;
  const pricingZone: QuoteZone = {
    id: zone?.id ?? "", name: zone?.name ?? "", kind: pickup ? "PICKUP" : zone?.kind ?? "ABUJA",
    ...fee,
    active: !storeIssue,
  };

  const q = quote({
    lines: known,
    variants: offer.variants.map((v) => ({
      id: v.variantId, sizeKg: v.sizeKg, retailPriceKobo: v.retailPriceKobo, wholesalePriceKobo: v.wholesalePriceKobo,
      stockQty: v.available, reservedQty: 0, active: v.active,
    })),
    zone: pricingZone,
    coupon,
    wholesale: opts.wholesale,
    userId: opts.userId,
  });
  return {
    lines: view,
    quote: q,
    zone: zone ? { id: zone.id, name: zone.name, kind: zone.kind, terms: pickup ? null : (fee.terms ?? zone.terms) } : null,
    fulfiller: toFulfiller(offer),
    fulfillment,
    storeIssue,
    couponCode: code,
    couponIssue: storeCouponIssue ?? (code && !found ? "COUPON_NOT_FOUND" : q.couponIssue),
  };
}

export function storeMessage(issue: StoreIssue | null, storeName?: string): string | null {
  switch (issue) {
    case null: return null;
    case "NO_STORE": return "Choose a store to buy from.";
    case "STORE_UNAVAILABLE": return "That store isn't taking orders right now. Please choose another store.";
    case "NO_DELIVERY_HERE": return `${storeName ?? "This store"} doesn't deliver to your area. Choose pickup, or another store.`;
    case "NO_PICKUP": return `${storeName ?? "This store"} doesn't offer pickup. Choose delivery, or another store.`;
  }
}

export function couponMessage(issue: CartQuote["couponIssue"]): string | null {
  switch (issue) {
    case null: return null;
    case "COUPON_NOT_FOUND": return "We couldn't find that coupon code.";
    case "COUPON_WRONG_SELLER": return "This code belongs to a different store and can't be used here.";
    case "COUPON_STORE_NOT_IN_PROMO": return "This store doesn't take part in Naija Sweet Rice promotions, so this coupon can't be used here. Try another store.";
    case "COUPON_NOT_STARTED": return "This coupon isn't active yet.";
    case "COUPON_EXPIRED": return "This coupon has expired.";
    case "COUPON_USED_UP": return "This coupon has already been used.";
    case "COUPON_NOT_YOURS": return "This coupon belongs to another account.";
    case "COUPON_MIN_ORDER": return "Your order is below this coupon's minimum spend.";
  }
}
