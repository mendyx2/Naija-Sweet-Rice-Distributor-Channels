"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rememberContact, requireUser } from "@/lib/auth";
import { normalizeNgPhone } from "@/lib/phone";
import { deliveryFeeKobo } from "@/lib/pricing";
import { sampleAddressKey } from "@/lib/samples";
import { CheckoutError, cancelUnpaidOrder, createPendingOrder, markOrderPaid } from "@/lib/orders";
import { offerFor, payToSnapshot } from "@/lib/network";
import { PAYMENT_HOLD_HOURS } from "@/lib/network-rules";
import { notifyNewTransferOrder } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

export type SampleState = { ok: false; error: string } | { ok: true; url: string } | null;

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(80),
  phone: z.string().max(30),
  zoneId: z.string().min(1, "Please choose your area.").max(40),
  storeId: z.string().min(1, "Please choose a store.").max(40),
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  street: z.string().trim().max(300).optional(),
  landmark: z.string().trim().max(200).optional(),
});

/** Free 1kg sample: the rice is ₦0, the customer pays delivery (pickup is free). One per account and per address. */
export async function requestSample(_prev: SampleState, formData: FormData): Promise<SampleState> {
  const user = await requireUser("/samples");
  if (!(await rateLimit(`sample:${user.id}`, 5, 10 * 60_000)).ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const f = parsed.data;
  const phone = normalizeNgPhone(f.phone);
  if (!phone) return { ok: false, error: "Please enter a valid Nigerian mobile number." };

  const so = await sampleOffer(f.zoneId, f.storeId, f.fulfillment);
  if (!so.ok) return { ok: false, error: so.error };
  const { zone, variant, from, fee } = so;
  const isPickup = f.fulfillment === "PICKUP";
  if (!isPickup && (!f.street || f.street.length < 5)) return { ok: false, error: "Please enter your delivery address." };

  const addressKey = isPickup ? `pickup:${user.id}` : sampleAddressKey(zone.id, f.street!);
  const existing = await db.sampleClaim.findFirst({ where: { OR: [{ userId: user.id }, { addressKey }] } });
  if (existing) return { ok: false, error: "A free sample has already been requested for this account or address." };

  const distributor = await db.distributor.findUniqueOrThrow({ where: { id: from.distributorId } });
  const payTo = payToSnapshot(distributor);
  let order;
  try {
    order = await createPendingOrder({
      type: "SAMPLE",
      distributorId: distributor.id,
      fulfillment: f.fulfillment,
      paymentMethod: fee === 0 ? "NONE" : "BANK_TRANSFER",
      payTo: fee === 0 ? null : payTo,
      userId: user.id,
      customerName: f.name,
      contactPhone: phone,
      contactEmail: user.email,
      zoneId: zone.id,
      address: isPickup ? null : { street: f.street!, landmark: f.landmark || null, zoneName: zone.name },
      note: "Free sample",
      couponId: null,
      referrerId: null,
      lines: [{ variantId: variant.id, qty: 1, unitPriceKobo: 0, sizeKg: variant.sizeKg }],
      subtotalKobo: 0,
      discountKobo: 0,
      deliveryFeeKobo: fee,
      totalKobo: fee,
    });
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, error: "Free samples are out of stock right now." };
    throw e;
  }

  try {
    await db.sampleClaim.create({ data: { userId: user.id, addressKey, orderId: order.id } });
  } catch (e) {
    await cancelUnpaidOrder(order.id, "Duplicate free sample request");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A free sample has already been requested for this account or address." };
    }
    throw e;
  }
  await rememberContact(user, f.name, phone);

  if (fee === 0) {
    await markOrderPaid(order.number, { source: "free-sample" });
  } else {
    await notifyNewTransferOrder({ ...order, payTo }, distributor.id, PAYMENT_HOLD_HOURS);
  }
  return { ok: true, url: `/orders/${order.number}` };
}

type SampleOffer =
  | { ok: false; error: string }
  | { ok: true; zone: NonNullable<Awaited<ReturnType<typeof offerFor>>["zone"]>; variant: { id: string; sizeKg: number }; from: NonNullable<Awaited<ReturnType<typeof offerFor>>["offer"]>; fee: number };

/** The free sample from the chosen store: it must have one in stock and deliver to the area (or offer pickup). */
async function sampleOffer(zoneId: string, storeId: string, fulfillment: "DELIVERY" | "PICKUP"): Promise<SampleOffer> {
  const [{ zone, offer }, variant] = await Promise.all([
    offerFor(storeId, zoneId),
    db.variant.findFirst({ where: { isSampleSize: true, active: true } }),
  ]);
  if (!zone || !zone.active || zone.kind === "NEARBY_TOWN") return { ok: false, error: "Free samples are available within Abuja." };
  if (!variant) return { ok: false, error: "Free samples aren't available right now. Please check back soon." };
  if (!offer?.ready || (offer.variants.find((v) => v.variantId === variant.id)?.available ?? 0) < 1) {
    return { ok: false, error: "This store has no free samples right now. Please choose another store." };
  }
  if (fulfillment === "PICKUP") {
    if (!offer.pickup) return { ok: false, error: "This store doesn't offer pickup. Choose delivery." };
    return { ok: true, zone, variant, from: offer, fee: 0 };
  }
  if (!offer.fee) return { ok: false, error: "This store doesn't deliver to your area. Choose pickup, or another store." };
  return { ok: true, zone, variant, from: offer, fee: deliveryFeeKobo({ ...zone, ...offer.fee, active: true }, variant.sizeKg) };
}

/** What the sample will cost from the chosen store: its delivery fee into the area, or free pickup. */
export async function getSampleQuote(zoneId: string, storeId: string, fulfillment: "DELIVERY" | "PICKUP"): Promise<{ feeKobo: number; seller: string } | { error: string } | null> {
  if (![zoneId, storeId].every((x) => z.string().min(1).max(40).safeParse(x).success)) return null;
  const so = await sampleOffer(zoneId, storeId, fulfillment === "PICKUP" ? "PICKUP" : "DELIVERY");
  return so.ok ? { feeKobo: so.fee, seller: so.from.name } : { error: so.error };
}
