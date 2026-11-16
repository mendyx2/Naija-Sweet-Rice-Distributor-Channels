"use server";

import { z } from "zod";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOps } from "@/lib/ops-auth";
import { normalizeNgPhone } from "@/lib/phone";
import { makeReferralCode } from "@/lib/auth";
import { dispatchBags, RestockError } from "@/lib/restock";
import { notifyPerson } from "@/lib/notify";
import { maskEmail, normalizeEmail } from "@/lib/email-address";
import { alertHq, notifyDistributor } from "@/lib/staff-alerts";
import { isTelegramConfigured, registerWebhook } from "@/lib/telegram";
import { site } from "@/lib/site";
import { TAGS } from "@/lib/catalogue";

export type FormState = { ok: boolean; message: string } | null;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);

const details = z.object({
  name: z.string().trim().min(2, "Enter the distributor's name.").max(100),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  hours: z.string().trim().max(120).optional(),
  homeZoneId: z.string().max(40).optional(),
});

/** The area a store's shop is in (must be an open delivery area), or null. */
async function homeZone(id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const z = await db.deliveryZone.findUnique({ where: { id } });
  return z && z.active && z.kind !== "PICKUP" ? z.id : null;
}

export async function createDistributor(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps();
  const parsed = details.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;
  const phone = f.phone ? normalizeNgPhone(f.phone) : null;
  if (f.phone && !phone) return { ok: false, message: "Enter a valid Nigerian phone number." };
  let slug = slugify(f.name) || "distributor";
  if (await db.distributor.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const d = await db.distributor.create({ data: { name: f.name, slug, phone, address: f.address || null, hours: f.hours || null, homeZoneId: await homeZone(f.homeZoneId) } });
  const variants = await db.variant.findMany({ select: { id: true } });
  await db.distributorStock.createMany({ data: variants.map((v) => ({ distributorId: d.id, variantId: v.id })), skipDuplicates: true });
  await db.auditLog.create({ data: { actor, action: "distributor.create", entity: "Distributor", entityId: d.id, after: { name: d.name } } });
  redirect(`/ops/distributors/${d.id}`);
}

export async function updateDistributor(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps();
  const id = String(formData.get("id") ?? "");
  const parsed = details.extend({
    slaHours: z.coerce.number().int().min(1).max(72),
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    alertEmail: z.union([z.literal(""), z.email("Enter a valid alert email.").max(120)]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const f = parsed.data;
  const phone = f.phone ? normalizeNgPhone(f.phone) : null;
  if (f.phone && !phone) return { ok: false, message: "Enter a valid Nigerian phone number." };
  const before = await db.distributor.findUnique({ where: { id } });
  if (!before) return { ok: false, message: "Distributor not found." };
  if (before.isHq && f.status === "SUSPENDED") return { ok: false, message: "HQ can't be suspended." };
  // A store waiting for approval (or not approved) only changes status through approveStore/rejectStore.
  const status = before.status === "PENDING" || before.status === "REJECTED" ? before.status : f.status;
  const after = { name: f.name, phone, address: f.address || null, hours: f.hours || null, homeZoneId: await homeZone(f.homeZoneId), slaHours: f.slaHours, status, alertEmail: f.alertEmail?.toLowerCase() || null };
  await db.$transaction([
    db.distributor.update({ where: { id }, data: after }),
    db.auditLog.create({ data: { actor, action: "distributor.update", entity: "Distributor", entityId: id, before: { status: before.status, name: before.name }, after } }),
  ]);
  updateTag(TAGS.zones);
  refresh();
  return { ok: true, message: f.status === "SUSPENDED" ? "Saved. This distributor is suspended: its areas are served by HQ." : "Saved." };
}

const bank = z.object({
  bankName: z.string().trim().min(2, "Enter the bank name.").max(60),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Account numbers (NUBAN) have 10 digits."),
  accountName: z.string().trim().min(3, "Enter the account name exactly as the bank shows it.").max(100),
});

/**
 * Only HQ can set where customers pay. Every change is logged and the
 * distributor's owners are alerted (Telegram and email), so a hijacked login can't quietly redirect payments.
 */
export async function updateBankDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps({ ownerOnly: true });
  const id = String(formData.get("id") ?? "");
  const parsed = bank.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = await db.distributor.findUnique({ where: { id }, include: { members: { where: { role: "OWNER" }, include: { user: true } } } });
  if (!d) return { ok: false, message: "Distributor not found." };
  const masked = (n: string | null) => (n ? `******${n.slice(-4)}` : null);
  await db.$transaction([
    db.distributor.update({ where: { id }, data: { ...parsed.data, bankUpdatedAt: new Date() } }),
    db.auditLog.create({
      data: { actor, action: "distributor.bank_change", entity: "Distributor", entityId: id,
        before: { bankName: d.bankName, accountNumber: masked(d.accountNumber), accountName: d.accountName },
        after: { bankName: parsed.data.bankName, accountNumber: masked(parsed.data.accountNumber), accountName: parsed.data.accountName } },
    }),
  ]);
  const alerted = await notifyDistributor(
    id,
    "bank account changed",
    `The bank account customers pay ${d.name} into was changed to ${parsed.data.bankName} ******${parsed.data.accountNumber.slice(-4)}. If you didn't request this, call HQ now.`,
    { allOwners: true },
  );
  refresh();
  return { ok: true, message: `Bank details saved.${alerted ? ` ${d.name} has been alerted.` : ` ${d.name} has no Telegram or email to alert yet.`}` };
}

/** The areas a store delivers to (several stores can share an area). New areas start at HQ's fee for them. */
export async function updateAreas(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps();
  const id = String(formData.get("id") ?? "");
  const d = await db.distributor.findUnique({ where: { id }, include: { zoneFees: true } });
  if (!d || d.isHq) return { ok: false, message: "HQ delivers to every open area; change HQ's fees under HQ delivery fees." };
  const wanted = new Set(formData.getAll("zone").map(String));
  const zones = await db.deliveryZone.findMany({ where: { kind: { not: "PICKUP" } } });
  const has = new Set(d.zoneFees.map((f) => f.zoneId));
  await db.$transaction(async (tx) => {
    for (const z of zones) {
      if (wanted.has(z.id) && !has.has(z.id)) {
        await tx.distributorZoneFee.create({
          data: { distributorId: id, zoneId: z.id, baseFeeKobo: z.baseFeeKobo, perKgFeeKobo: z.perKgFeeKobo, minOrderKg: z.minOrderKg, minOrderKobo: z.minOrderKobo, etaHours: z.etaHours, terms: z.terms },
        });
      } else if (!wanted.has(z.id) && has.has(z.id)) {
        await tx.distributorZoneFee.delete({ where: { distributorId_zoneId: { distributorId: id, zoneId: z.id } } });
      }
    }
    await tx.auditLog.create({ data: { actor, action: "distributor.areas", entity: "Distributor", entityId: id, after: { zones: [...wanted] } } });
  });
  updateTag(TAGS.zones);
  refresh();
  return { ok: true, message: `Areas saved: ${wanted.size} area${wanted.size === 1 ? "" : "s"}.` };
}

export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps();
  const id = String(formData.get("id") ?? "");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = formData.get("role") === "OWNER" ? "OWNER" : "STAFF";
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || null;
  if (!email) return { ok: false, message: "Enter a valid email address." };
  const d = await db.distributor.findUnique({ where: { id } });
  if (!d) return { ok: false, message: "Distributor not found." };
  const user = (await db.user.findUnique({ where: { email }, include: { distributorMember: true } }))
    ?? (await db.user.create({ data: { email, name, referralCode: makeReferralCode(name) }, include: { distributorMember: true } }));
  if (user.roles.includes("OWNER") || user.roles.includes("STAFF")) {
    return { ok: false, message: `${maskEmail(email)} is HQ staff and can't also join a distributor team.` };
  }
  if (user.distributorMember && user.distributorMember.distributorId !== id) {
    return { ok: false, message: `${maskEmail(email)} already belongs to another distributor.` };
  }
  await db.distributorMember.upsert({ where: { userId: user.id }, create: { userId: user.id, distributorId: id, role }, update: { role } });
  if (name && !user.name) await db.user.update({ where: { id: user.id }, data: { name } });
  await db.auditLog.create({ data: { actor, action: "distributor.member_add", entity: "Distributor", entityId: id, after: { userId: user.id, role } } });
  await notifyPerson(email, `you've been added to ${d.name}`, `You've been added to ${d.name} on the ${site.name} partner portal. Sign in with this email address at ${site.url}/partner`);
  refresh();
  return { ok: true, message: `Added ${maskEmail(email)} as ${role.toLowerCase()}. They've been emailed a sign-in link.` };
}

export async function removeMember(formData: FormData) {
  const actor = await requireOps();
  const userId = String(formData.get("userId") ?? "");
  const m = await db.distributorMember.findUnique({ where: { userId } });
  if (!m) return;
  await db.$transaction([
    db.distributorMember.delete({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }), // sign them out everywhere
    db.auditLog.create({ data: { actor, action: "distributor.member_remove", entity: "Distributor", entityId: m.distributorId, after: { userId } } }),
  ]);
  refresh();
}

/** HQ sends bags: they leave HQ's shelf now and show as "in transit" until the distributor confirms receipt. */
export async function sendStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps();
  const id = String(formData.get("id") ?? "");
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 60) || null;
  const d = await db.distributor.findUnique({ where: { id } });
  if (!d || d.isHq) return { ok: false, message: "Choose a distributor to send stock to." };
  const variants = await db.variant.findMany();
  const lines = variants
    .map((v) => ({ v, qty: Number(formData.get(`qty:${v.id}`) || 0) }))
    .filter((l) => l.qty !== 0);
  if (!lines.length) return { ok: false, message: "Enter how many bags to send." };
  if (lines.some((l) => !Number.isInteger(l.qty) || l.qty < 0 || l.qty > 100_000)) return { ok: false, message: "Quantities must be whole numbers." };

  try {
    await db.$transaction((tx) => dispatchBags(tx, id, d.name, lines.map(({ v, qty }) => ({ variantId: v.id, sizeKg: v.sizeKg, qty })), actor, reference ?? undefined));
  } catch (e) {
    if (e instanceof RestockError) return { ok: false, message: e.message };
    throw e;
  }
  await notifyDistributor(id, "Stock on its way", `HQ has dispatched ${lines.map((l) => `${l.qty}×${l.v.sizeKg}kg`).join(", ")}${reference ? ` (ref ${reference})` : ""}. Confirm when received: ${site.url}/partner/stock`);
  updateTag(TAGS.catalogue);
  refresh();
  return { ok: true, message: `Dispatched ${lines.map((l) => `${l.qty} × ${l.v.sizeKg}kg`).join(", ")}. It shows as in transit until ${d.name} confirms receipt.` };
}

/** Damage write-offs and count corrections from distributors only change stock once HQ approves. */
export async function reviewAdjustment(formData: FormData) {
  const actor = await requireOps();
  const id = String(formData.get("movementId") ?? "");
  const approve = formData.get("decision") === "approve";
  await db.$transaction(async (tx) => {
    const m = await tx.stockMovement.findUnique({ where: { id } });
    if (!m || m.status !== "PENDING_APPROVAL") return;
    if (approve) {
      const rows = await tx.$queryRaw<{ onHand: number }[]>`
        UPDATE "DistributorStock" SET "onHand" = "onHand" + ${m.delta}, "updatedAt" = NOW()
        WHERE "distributorId" = ${m.distributorId} AND "variantId" = ${m.variantId} RETURNING "onHand"`;
      await tx.stockMovement.update({ where: { id }, data: { status: "APPLIED", onHandAfter: rows[0]?.onHand, note: `${m.note ?? ""} (approved by HQ)`.trim() } });
    } else {
      await tx.stockMovement.update({ where: { id }, data: { status: "REJECTED", note: `${m.note ?? ""} (rejected by HQ)`.trim() } });
    }
    await tx.auditLog.create({ data: { actor, action: approve ? "stock.adjust_approved" : "stock.adjust_rejected", entity: "StockMovement", entityId: id } });
  });
  refresh();
}

// ─── HQ alert channels ──────────────────────────────────────────────────────

export async function removeHqChat(formData: FormData) {
  const actor = await requireOps();
  const id = String(formData.get("id") ?? "");
  await db.telegramChat.deleteMany({ where: { id, isHq: true } });
  await db.auditLog.create({ data: { actor, action: "alerts.hq_chat_remove", entity: "TelegramChat", entityId: id } });
  refresh();
}

/** Tells Telegram where to deliver messages for our bot. Needs the live https site. */
export async function setupTelegramBot(): Promise<FormState> {
  await requireOps();
  if (!isTelegramConfigured() || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return { ok: false, message: "Add TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET to the site settings first." };
  }
  if (!site.url.startsWith("https://")) return { ok: false, message: "The site must be live on https before Telegram can reach it." };
  try {
    await registerWebhook(`${site.url}/api/telegram/webhook`);
    return { ok: true, message: "Telegram bot is connected to the site." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Telegram setup failed." };
  }
}

export async function testHqAlert(): Promise<FormState> {
  await requireOps();
  const sent = await alertHq("This is a test alert. If you can read this, HQ alerts are working.", "Test alert");
  return sent ? { ok: true, message: `Test alert sent to ${sent} place${sent === 1 ? "" : "s"}.` } : { ok: false, message: "No HQ Telegram chat or alert email is connected yet." };
}

/** HQ approves a store that signed up: it goes live for customers in its areas. Owners only. */
export async function approveStore(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps({ ownerOnly: true });
  const id = String(formData.get("id") ?? "");
  const d = await db.distributor.findUnique({ where: { id }, include: { members: { where: { role: "OWNER" }, include: { user: true } } } });
  if (!d || d.status !== "PENDING") return { ok: false, message: "This store isn't waiting for approval." };
  if (!d.bankName || !d.accountNumber || !d.accountName) return { ok: false, message: "Add the store's bank details first." };
  await db.$transaction([
    db.distributor.update({ where: { id }, data: { status: "ACTIVE", approvedAt: new Date(), approvedBy: actor } }),
    db.auditLog.create({ data: { actor, action: "store.approve", entity: "Distributor", entityId: id } }),
  ]);
  for (const m of d.members) {
    await notifyPerson(m.user.email, `${d.name} is approved`,
      `Good news: ${d.name} is approved and visible to customers in your areas once you have stock and prices.\n\nYour portal: ${site.url}/partner\nYour shop link: ${site.url}/distributors/${d.slug}`);
  }
  updateTag(TAGS.zones);
  refresh();
  return { ok: true, message: `${d.name} is approved. Record their opening stock below so customers can buy.` };
}

/** HQ declines a store that signed up. Owners only. */
export async function rejectStore(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps({ ownerOnly: true });
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  const d = await db.distributor.findUnique({ where: { id }, include: { members: { where: { role: "OWNER" }, include: { user: true } } } });
  if (!d || d.status !== "PENDING") return { ok: false, message: "This store isn't waiting for approval." };
  await db.$transaction([
    db.distributor.update({ where: { id }, data: { status: "REJECTED" } }),
    db.auditLog.create({ data: { actor, action: "store.reject", entity: "Distributor", entityId: id, after: { reason } } }),
  ]);
  for (const m of d.members) {
    await notifyPerson(m.user.email, `about ${d.name}`, `We couldn't approve ${d.name} on ${site.name} at this time.${reason ? ` ${reason}` : ""} Please contact HQ if you have questions.`);
  }
  refresh();
  return { ok: true, message: `${d.name} was not approved. The applicant has been emailed.` };
}
