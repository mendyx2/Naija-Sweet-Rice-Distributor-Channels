"use server";

import { refresh } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOps } from "@/lib/ops-auth";
import { makeReferralCode } from "@/lib/auth";
import { maskEmail, normalizeEmail } from "@/lib/email-address";
import { notifyPerson } from "@/lib/notify";
import { site } from "@/lib/site";

export type FormState = { ok: boolean; message: string } | null;

export async function addHqMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps({ ownerOnly: true });
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || null;
  const role: Role = formData.get("role") === "OWNER" ? "OWNER" : "STAFF";
  if (!email) return { ok: false, message: "Enter a valid email address." };
  if (!name) return { ok: false, message: "Enter their name (it shows in the activity log)." };
  const user = (await db.user.findUnique({ where: { email }, include: { distributorMember: true } }))
    ?? (await db.user.create({ data: { email, name, referralCode: makeReferralCode(name) }, include: { distributorMember: true } }));
  // Keep HQ and distributor access separate: HQ staff approve distributors' payments and stock.
  if (user.distributorMember) return { ok: false, message: `${maskEmail(email)} belongs to a distributor team and can't also be HQ staff.` };
  const roles = [...new Set([...user.roles.filter((r) => r !== "OWNER" && r !== "STAFF"), role])];
  await db.user.update({ where: { id: user.id }, data: { roles, name: user.name ?? name } });
  await db.auditLog.create({ data: { actor, action: "hq.member_add", entity: "User", entityId: user.id, after: { role } } });
  await notifyPerson(email, "you've been given HQ access", `You've been given ${site.name} HQ access. Sign in with this email address at ${site.url}/ops`);
  refresh();
  return { ok: true, message: `${name} (${maskEmail(email)}) added as ${role === "OWNER" ? "an owner" : "staff"}.` };
}

export async function removeHqMember(formData: FormData) {
  const actor = await requireOps({ ownerOnly: true });
  const userId = String(formData.get("userId") ?? "");
  if (actor === `hq:${userId}`) return; // can't remove yourself
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { roles: user.roles.filter((r) => r !== "OWNER" && r !== "STAFF") } }),
    db.session.deleteMany({ where: { userId } }), // signed out everywhere
    db.auditLog.create({ data: { actor, action: "hq.member_remove", entity: "User", entityId: userId } }),
  ]);
  refresh();
}
