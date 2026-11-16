import "server-only";
import type { DeliveryZone, Distributor, Prisma } from "@prisma/client";
import { db } from "./db";
import { sortStores, withinBand, type Offer, type OfferFee } from "./network-rules";
import { site } from "./site";

export const HQ_ID = "hq";

const hasBank = (d: Distributor) => !!(d.bankName && d.accountNumber && d.accountName);

/** HQ's pickup address is the flagship store's (site settings) unless set on HQ's record. */
const hqAddress = () => [site.street, site.area, "Abuja"].filter(Boolean).join(", ") || null;

/** What one store (or HQ) can sell into a given area: prices, stock, delivery fee and pickup. */
async function buildOffer(d: Distributor, zone: DeliveryZone | null): Promise<Offer> {
  const [variants, stock, prices, fee] = await Promise.all([
    db.variant.findMany({ include: { product: true } }),
    db.distributorStock.findMany({ where: { distributorId: d.id } }),
    d.isHq ? Promise.resolve([]) : db.distributorPrice.findMany({ where: { distributorId: d.id } }),
    zone && !d.isHq ? db.distributorZoneFee.findUnique({ where: { distributorId_zoneId: { distributorId: d.id, zoneId: zone.id } } }) : null,
  ]);
  const stockBy = new Map(stock.map((s) => [s.variantId, Math.max(s.onHand - s.held, 0)]));
  const priceBy = new Map(prices.map((p) => [p.variantId, p]));

  // HQ delivers to its own areas (Abuja and nearby towns) at HQ's fees; other stores to the areas they've set a fee for.
  const zoneFee: OfferFee | null = !zone || !zone.active || zone.kind === "PICKUP" || (d.isHq && zone.kind === "AREA")
    ? null
    : d.isHq
      ? { baseFeeKobo: zone.baseFeeKobo, perKgFeeKobo: zone.perKgFeeKobo, minOrderKg: zone.minOrderKg, minOrderKobo: zone.minOrderKobo, etaHours: zone.etaHours, terms: zone.terms }
      : fee && { baseFeeKobo: fee.baseFeeKobo, perKgFeeKobo: fee.perKgFeeKobo, minOrderKg: fee.minOrderKg, minOrderKobo: fee.minOrderKobo, etaHours: fee.etaHours, terms: fee.terms };

  return {
    distributorId: d.id,
    slug: d.slug,
    name: d.isHq ? "Naija Sweet Rice HQ" : d.name,
    isHq: d.isHq,
    ready: d.status === "ACTIVE" && hasBank(d),
    address: d.address ?? (d.isHq ? hqAddress() : null),
    hours: d.hours ?? (d.isHq ? site.hoursLabel : null),
    pickup: d.pickupEnabled && !!(d.address ?? (d.isHq ? hqAddress() : null)),
    joinsHqPromotions: d.isHq || d.joinsHqPromotions,
    fee: zoneFee,
    variants: variants.map((v) => {
      const p = priceBy.get(v.id);
      // Distributor prices only count if they sit inside HQ's current range.
      const retail = d.isHq ? v.retailPriceKobo : p && withinBand(p.retailPriceKobo, v.minRetailKobo, v.maxRetailKobo) ? p.retailPriceKobo : null;
      return {
        variantId: v.id,
        sizeKg: v.sizeKg,
        retailPriceKobo: retail,
        wholesalePriceKobo: d.isHq ? v.wholesalePriceKobo : retail != null ? (p?.wholesalePriceKobo ?? null) : null,
        available: stockBy.get(v.id) ?? 0,
        active: v.active && v.product.active,
      };
    }),
  };
}

export async function getHq(): Promise<Distributor> {
  return db.distributor.findUniqueOrThrow({ where: { id: HQ_ID } });
}

/**
 * Every approved store a customer in this area can buy from: HQ (in its own
 * Abuja-region areas), each distributor that has set a delivery fee for the area,
 * and any store whose shop is in the area and offers pickup.
 * Sorted for the chosen size; see sortStores.
 */
export async function storesForZone(zoneId: string | null, variantId?: string | null): Promise<{ zone: DeliveryZone | null; stores: Offer[] }> {
  const zone = zoneId ? await db.deliveryZone.findUnique({ where: { id: zoneId } }) : null;
  if (!zone || !zone.active) return { zone, stores: [] };
  const ds = await db.distributor.findMany({
    where: { status: "ACTIVE", OR: [{ isHq: true }, { zoneFees: { some: { zoneId: zone.id } } }, { homeZoneId: zone.id, pickupEnabled: true }] },
  });
  const homeHere = new Set(ds.filter((d) => d.homeZoneId === zone.id).map((d) => d.id));
  const offers = await Promise.all(ds.map((d) => buildOffer(d, zone)));
  return { zone, stores: sortStores(offers.filter((o) => o.ready && (o.fee || (o.pickup && homeHere.has(o.distributorId)))), variantId) };
}

/** One store's offer for an area (fee is null if it doesn't deliver there). */
export async function offerFor(distributorId: string, zoneId: string | null) {
  const [d, zone] = await Promise.all([
    db.distributor.findUnique({ where: { id: distributorId } }),
    zoneId ? db.deliveryZone.findUnique({ where: { id: zoneId } }) : null,
  ]);
  return { zone, offer: d ? await buildOffer(d, zone) : null };
}

/** Current HQ per-bag fee for each bag size (latest rate in force). */
export async function currentHqFees(at = new Date()): Promise<Map<string, number>> {
  const rows = await db.hqFeeRate.findMany({ where: { effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: "desc" } });
  const m = new Map<string, number>();
  for (const r of rows) if (!m.has(r.variantId)) m.set(r.variantId, r.feeKobo);
  return m;
}

export function payToSnapshot(d: Distributor) {
  return { distributorName: d.isHq ? "Naija Sweet Rice HQ" : d.name, bankName: d.bankName, accountNumber: d.accountNumber, accountName: d.accountName };
}

export type Tx = Prisma.TransactionClient;
