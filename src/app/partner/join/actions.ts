"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, requireUser } from "@/lib/auth";
import { formatNaira, nairaToKobo } from "@/lib/money";
import { withinBand } from "@/lib/network-rules";
import { hashPassword, passwordProblem } from "@/lib/password";
import { normalizeNgPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { alertHq } from "@/lib/staff-alerts";
import { notifyPerson } from "@/lib/notify";
import { site } from "@/lib/site";
import { TAGS } from "@/lib/catalogue";
import { findOrCreateArea } from "@/lib/areas";
import { isNigerianState } from "@/lib/states";

export type JoinState = { ok: boolean; message: string } | null;

const schema = z.object({
  ownerName: z.string().trim().min(2, "Enter your full name.").max(80),
  password: z.string().max(200),
  confirm: z.string().max(200),
  name: z.string().trim().min(3, "Enter your business name.").max(80),
  cacNumber: z.string().trim().max(20).optional(),
  address: z.string().trim().min(8, "Enter your shop address (customers who pick up go here).").max(200),
  state: z.string().max(30),
  homeZoneId: z.string().min(1, "Choose the area your shop is in.").max(40),
  newHomeArea: z.string().max(80).optional(),
  newAreas: z.string().max(400).optional(),
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
 * signing up becomes the store's owner, sets the password for the distributor
 * portal (separate from HQ and customer sign-in) and their prices per bag.
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
  const pwProblem = passwordProblem(f.password);
  if (pwProblem) return { ok: false, message: `Password: ${pwProblem}` };
  if (f.password !== f.confirm) return { ok: false, message: "The two passwords don't match." };

  // Prices per bag size, inside HQ's range. At least one size must be priced.
  const variants = await db.variant.findMany({ orderBy: { sizeKg: "desc" } });
  const prices: { variantId: string; retailPriceKobo: number }[] = [];
  for (const v of variants) {
    const raw = String(formData.get(`retail:${v.id}`) ?? "").trim();
    if (!raw) continue;
    const kobo = nairaToKobo(raw);
    if (kobo == null || Number.isNaN(kobo) || kobo <= 0) return { ok: false, message: `${v.sizeKg}kg: enter the price in naira, e.g. 25000.` };
    if (!withinBand(kobo, v.minRetailKobo, v.maxRetailKobo)) {
      return { ok: false, message: `${v.sizeKg}kg: the price must be between ${v.minRetailKobo != null ? formatNaira(v.minRetailKobo) : "any"} and ${v.maxRetailKobo != null ? formatNaira(v.maxRetailKobo) : "any"}.` };
    }
    prices.push({ variantId: v.id, retailPriceKobo: kobo });
  }
  if (!prices.length) return { ok: false, message: "Set your price for at least one bag size." };

  const phone = normalizeNgPhone(f.phone);
  if (!phone) return { ok: false, message: "Enter a valid Nigerian phone number for the store." };
  const baseFeeKobo = nairaToKobo(f.baseFee) ?? 0;
  const perKgFeeKobo = nairaToKobo(f.perKgFee) ?? 0;
  if (Number.isNaN(baseFeeKobo) || Number.isNaN(perKgFeeKobo) || baseFeeKobo < 0 || perKgFeeKobo < 0) {
    return { ok: false, message: "Enter the delivery fee in naira, e.g. 1500." };
  }
  const pickup = !!formData.get("pickup");
  if (!isNigerianState(f.state)) return { ok: false, message: "Choose your state." };
  const typed = (f.newAreas ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  const zoneIds = [...new Set(formData.getAll("zone").map(String))].slice(0, 100);
  const ticked = await db.deliveryZone.findMany({ where: { id: { in: zoneIds }, state: f.state, active: true, kind: { not: "PICKUP" } } });
  if (!ticked.length && !typed.length && !pickup) return { ok: false, message: "Choose at least one area you deliver to, or offer pickup." };

  // The shop's area: one of the state's areas, or a new one the distributor typed.
  const home = f.homeZoneId === "new"
    ? await findOrCreateArea(f.newHomeArea ?? "", f.state)
    : await db.deliveryZone.findFirst({ where: { id: f.homeZoneId, state: f.state, active: true, kind: { not: "PICKUP" } } });
  if (!home) return { ok: false, message: f.homeZoneId === "new" ? "Enter the name of your shop's area." : "Choose the area your shop is in." };
  // Areas typed in are created in the same state. A store that delivers also delivers in its own area.
  const created = (await Promise.all(typed.map((n) => findOrCreateArea(n, f.state)))).filter((z): z is NonNullable<typeof z> => !!z);
  const delivery = [...ticked, ...created];
  const zones = [...new Map([...delivery, ...(delivery.length ? [home] : [])].map((z) => [z.id, z])).values()];

  let slug = slugify(f.name) || "store";
  if (await db.distributor.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const passwordHash = await hashPassword(f.password);

  const d = await db.$transaction(async (tx) => {
    const store = await tx.distributor.create({
      data: {
        name: f.name, slug, status: "PENDING", phone, address: f.address, homeZoneId: home.id, hours: f.hours || null, cacNumber: f.cacNumber || null,
        bankName: f.bankName, accountNumber: f.accountNumber, accountName: f.accountName, bankUpdatedAt: new Date(),
        pickupEnabled: pickup, joinsHqPromotions: !!formData.get("hqPromotions"), alertEmail: user.email,
      },
    });
    await tx.distributorMember.create({ data: { userId: user.id, distributorId: store.id, role: "OWNER" } });
    await tx.distributorPrice.createMany({ data: prices.map((x) => ({ distributorId: store.id, ...x })) });
    await tx.user.update({ where: { id: user.id }, data: { name: f.ownerName, passwordHash } });
    await tx.distributorStock.createMany({ data: variants.map((v) => ({ distributorId: store.id, variantId: v.id })), skipDuplicates: true });
    if (zones.length) {
      await tx.distributorZoneFee.createMany({
        data: zones.map((z) => ({ distributorId: store.id, zoneId: z.id, baseFeeKobo, perKgFeeKobo, minOrderKg: z.minOrderKg, etaHours: z.etaHours })),
      });
    }
    await tx.auditLog.create({ data: { actor: `user:${user.id}`, action: "store.apply", entity: "Distributor", entityId: store.id, after: { name: f.name, areas: zones.length, pickup, sizesPriced: prices.length } } });
    return store;
  });
  if (!user.phone) await db.user.update({ where: { id: user.id }, data: { phone } }).catch(() => {});
  updateTag(TAGS.zones);

  await alertHq(`New store waiting for approval: ${d.name} (${zones.length} area${zones.length === 1 ? "" : "s"}${pickup ? ", pickup" : ""}). Review: ${site.url}/ops/distributors/${d.id}`, "New store to approve");
  await notifyPerson(user.email, `we've received ${d.name}`,
    `Thanks for opening ${d.name} on ${site.name}. HQ will check your details and email you when the store is approved. It goes live for customers then, with the prices you set.\n\nSign in to your distributor portal any time at ${site.url}/partner/login with ${user.email} and the password you chose. You can change your prices, delivery areas and details there.`);
  // Signed straight into the distributor portal (its own kind of session).
  await createSession(user.id, "PARTNER");
  redirect("/partner");
}
