"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { storesForZone } from "@/lib/network";

export type StoreListing = {
  id: string;
  slug: string;
  name: string;
  isHq: boolean;
  address: string | null;
  hours: string | null;
  pickup: boolean;
  joinsHqPromotions: boolean;
  delivery: { baseFeeKobo: number; perKgFeeKobo: number; minOrderKg: number | null; etaHours: number | null } | null;
  sizes: { variantId: string; sizeKg: number; priceKobo: number | null; compareAtKobo: number | null; available: number }[];
};

/** The stores a customer in this area can buy from, for the store list on product, cart and area pages. */
export async function getAreaStores(zoneId: string, variantId?: string | null): Promise<{ zoneName: string; stores: StoreListing[] } | null> {
  if (!z.string().min(1).max(40).safeParse(zoneId).success) return null;
  const vid = variantId && variantId.length <= 40 ? variantId : null;
  const { zone, stores } = await storesForZone(zoneId, vid);
  if (!zone) return null;
  const compareAt = new Map((await db.variant.findMany({ select: { id: true, compareAtPriceKobo: true } })).map((v) => [v.id, v.compareAtPriceKobo]));
  return {
    zoneName: zone.name,
    stores: stores.map((s) => ({
      id: s.distributorId,
      slug: s.slug,
      name: s.name,
      isHq: s.isHq,
      address: s.address,
      hours: s.hours,
      pickup: s.pickup,
      joinsHqPromotions: s.joinsHqPromotions,
      delivery: s.fee && { baseFeeKobo: s.fee.baseFeeKobo, perKgFeeKobo: s.fee.perKgFeeKobo, minOrderKg: s.fee.minOrderKg, etaHours: s.fee.etaHours },
      sizes: s.variants.filter((v) => v.active).map((v) => ({
        variantId: v.variantId,
        sizeKg: v.sizeKg,
        priceKobo: v.retailPriceKobo,
        // HQ's "was" price is an HQ promotion; distributors' prices are shown as they are.
        compareAtKobo: s.isHq ? (compareAt.get(v.variantId) ?? null) : null,
        available: v.available,
      })),
    })),
  };
}
