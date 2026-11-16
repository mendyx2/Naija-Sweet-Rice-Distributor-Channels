"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nairaToKobo } from "@/lib/money";
import { normalizeNgPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { alertHq } from "@/lib/staff-alerts";
import { notifyPerson } from "@/lib/notify";
import { site } from "@/lib/site";
import { TAGS } from "@/lib/catalogue";

export type JoinState = { ok: boolean; message: string } | null;

const schema = z.object({
  name: z.string().trim().min(3, "Enter your business name.").max(80),
  cacNumber: z.string().trim().max(20).optional(),
  address: z.string().trim().min(8, "Enter your shop address (customers who pick up go here).").max(200),
  phone: z.string().trim().max(30),
  hours: z.string().trim().max(80).optional(),
  bankName: z.string().trim().min(2, "Enter the bank name.").max(60),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Account numbers (NUBAN) have 10 digits."),
  accountName: z.string().trim().min(3, "Enter the account name exactly as the bank shows it.").max(100),
  baseFee: z.string().max(12),
  perKgFee: z.string().max(12),
  agree: z.literal("on", { message: "Please accept the distributor terms." }),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);

/**
 * A distributor opens their store: it's created with their name, bank account,
 * areas and delivery fee, but stays hidden until HQ approves it. The person
 * signing up becomes the store's owner in the partner portal.
 */
export async function openStore(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const user = await requireUser("/partner/join");
  if (!(await rateLimit(`join:${user.id}`, 5, 60 * 60_000)).ok) return { ok: false, message: "Too many attempts. Please try again later." };
  if (await db.distributorMember.findUnique({ where: { userId: user.id } })) redirect("/partner");
  if (user.roles.includes("OWNER") || user.roles.includes("STAFF")) {
    return { ok: false, message: "HQ staff accounts can't also own a store. Sign in with a different email to open one." };
  }

  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "zone")));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;
  const phone = normalizeNgPhone(f.phone);
  if (!phone) return { ok: false, message: "Enter a valid Nigerian phone number for the store." };
  const baseFeeKobo = nairaToKobo(f.baseFee) ?? 0;
  const perKgFeeKobo = nairaToKobo(f.perKgFee) ?? 0;
  if (Number.isNaN(baseFeeKobo) || Number.isNaN(perKgFeeKobo) || baseFeeKobo < 0 || perKgFeeKobo < 0) {
    return { ok: false, message: "Enter the delivery fee in naira, e.g. 1500." };
  }
  const pickup = !!formData.get("pickup");
  const zoneIds = [...new Set(formData.getAll("zone").map(String))].slice(0, 100);
  const zones = await db.deliveryZone.findMany({ where: { id: { in: zoneIds }, active: true, kind: { not: "PICKUP" } } });
  if (!zones.length && !pickup) return { ok: false, message: "Choose at least one area you deliver to, or offer pickup." };

  let slug = slugify(f.name) || "store";
  if (await db.distributor.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const variants = await db.variant.findMany({ select: { id: true } });

  const d = await db.$transaction(async (tx) => {
    const store = await tx.distributor.create({
      data: {
        name: f.name, slug, status: "PENDING", phone, address: f.address, hours: f.hours || null, cacNumber: f.cacNumber || null,
        bankName: f.bankName, accountNumber: f.accountNumber, accountName: f.accountName, bankUpdatedAt: new Date(),
        pickupEnabled: pickup, joinsHqPromotions: !!formData.get("hqPromotions"), alertEmail: user.email,
      },
    });
    await tx.distributorMember.create({ data: { userId: user.id, distributorId: store.id, role: "OWNER" } });
    await tx.distributorStock.createMany({ data: variants.map((v) => ({ distributorId: store.id, variantId: v.id })), skipDuplicates: true });
    if (zones.length) {
      await tx.distributorZoneFee.createMany({
        data: zones.map((z) => ({ distributorId: store.id, zoneId: z.id, baseFeeKobo, perKgFeeKobo, minOrderKg: z.minOrderKg, etaHours: z.etaHours })),
      });
    }
    await tx.auditLog.create({ data: { actor: `user:${user.id}`, action: "store.apply", entity: "Distributor", entityId: store.id, after: { name: f.name, areas: zones.length, pickup } } });
    return store;
  });
  if (!user.phone) await db.user.update({ where: { id: user.id }, data: { phone } }).catch(() => {});
  updateTag(TAGS.zones);

  await alertHq(`New store waiting for approval: ${d.name} (${zones.length} area${zones.length === 1 ? "" : "s"}${pickup ? ", pickup" : ""}). Review: ${site.url}/ops/distributors/${d.id}`, "New store to approve");
  await notifyPerson(user.email, `we've received ${d.name}`,
    `Thanks for opening ${d.name} on ${site.name}. HQ will check your details and email you when the store is approved.\n\nMeanwhile you can set your prices and delivery fees in the partner portal: ${site.url}/partner/settings`);
  redirect("/partner/settings");
}
