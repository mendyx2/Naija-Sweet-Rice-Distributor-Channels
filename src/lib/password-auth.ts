import "server-only";
import { headers } from "next/headers";
import type { PasswordPurpose, User } from "@prisma/client";
import { db } from "./db";
import { createSession, makeReferralCode } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { normalizeEmail } from "./email-address";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { clientIp } from "./request";
import { sendEmail } from "./email";
import { alertHq } from "./staff-alerts";
import { bootstrapOwners } from "./ops-auth";
import { site } from "./site";

/**
 * Email + password sign-in for HQ (/ops) and distributors (/partner), kept
 * separate from each other and from customers' email-code sign-in. Passwords
 * are set through one-time emailed links (invites and "forgot password").
 */

const LINK_MINUTES = 60;
const area = (p: PasswordPurpose) => (p === "HQ" ? "ops" : "partner");
const lagos = (d: Date) => d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

/** Who may hold a password of this kind: HQ owners/staff, or distributor team members. */
async function eligible(user: User & { distributorMember: { distributorId: string } | null }, purpose: PasswordPurpose) {
  if (purpose === "HQ") return user.roles.includes("OWNER") || user.roles.includes("STAFF") || (!!user.email && bootstrapOwners().has(user.email));
  return !!user.distributorMember;
}

/** Emails a one-time link to set (invite) or reset a password. Returns false if not sent. */
export async function sendPasswordLink(userId: string, purpose: PasswordPurpose, reason: "invite" | "reset"): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.email) return false;
  const token = randomToken();
  await db.passwordToken.create({ data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) } });
  const url = `${site.url}/${area(purpose)}/password?token=${token}`;
  const where = purpose === "HQ" ? `${site.name} HQ` : `the ${site.name} distributor portal`;
  const text = reason === "invite"
    ? `You've been given access to ${where}. Set your password here (the link works once, for ${LINK_MINUTES} minutes):\n\n${url}\n\nThen sign in at ${site.url}/${area(purpose)}/login with ${user.email}.`
    : `Someone asked to reset the password for ${user.email} on ${where}. If it was you, set a new one here (the link works once, for ${LINK_MINUTES} minutes):\n\n${url}\n\nIf it wasn't you, ignore this email: your password hasn't changed.`;
  return sendEmail(user.email, `${site.name}: ${reason === "invite" ? "set your password" : "reset your password"}`, text);
}

/**
 * "Forgot password" / first-time setup. Always answers the same way, so it
 * can't be used to discover who has access. HQ owners named in
 * HQ_OWNER_EMAILS get an account created on first use.
 */
export async function requestPasswordLink(rawEmail: string, purpose: PasswordPurpose): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const ip = await clientIp();
  if (!email || !(await rateLimit(`pw-link:${ip}`, 10, 15 * 60_000)).ok || !(await rateLimit(`pw-link:${email}`, 3, 15 * 60_000)).ok) return;
  let user = await db.user.findUnique({ where: { email }, include: { distributorMember: true } });
  if (!user && purpose === "HQ" && bootstrapOwners().has(email)) {
    user = await db.user.create({ data: { email, roles: ["BUYER", "OWNER"], referralCode: makeReferralCode(null) }, include: { distributorMember: true } });
  }
  if (!user || !(await eligible(user, purpose))) return;
  await sendPasswordLink(user.id, purpose, user.passwordHash ? "reset" : "invite");
}

/** Sets the password from an emailed link. Signs out every other session of that kind. */
export async function setPasswordFromLink(token: string, purpose: PasswordPurpose, password: string, confirm: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: problem };
  if (password !== confirm) return { ok: false, message: "The two passwords don't match." };
  const row = token.length <= 100 ? await db.passwordToken.findUnique({ where: { tokenHash: sha256(token) } }) : null;
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
    return { ok: false, message: "This link has expired or was already used. Ask for a new one." };
  }
  const { count } = await db.passwordToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) return { ok: false, message: "This link was already used. Ask for a new one." };
  await db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId: row.userId, kind: purpose } });
  await db.auditLog.create({ data: { actor: `user:${row.userId}`, action: `${purpose.toLowerCase()}.password_set`, entity: "User", entityId: row.userId } });
  return { ok: true };
}

/** Checks email + password and starts an HQ or distributor session. */
export async function signInWithPassword(rawEmail: string, password: string, purpose: PasswordPurpose): Promise<{ ok: true; user: User } | { ok: false; message: string }> {
  const email = normalizeEmail(rawEmail);
  const ip = await clientIp();
  const generic = { ok: false as const, message: "That email and password don't match. Try again, or reset your password." };
  if (!(await rateLimit(`pw-login:${ip}`, 20, 15 * 60_000)).ok || (email && !(await rateLimit(`pw-login:${email}`, 8, 15 * 60_000)).ok)) {
    return { ok: false, message: "Too many attempts. Please wait 15 minutes, or reset your password." };
  }
  if (!email || !password) return generic;
  const user = await db.user.findUnique({ where: { email }, include: { distributorMember: true } });
  const good = !!user && (await eligible(user, purpose)) && (await verifyPassword(password, user.passwordHash));
  if (!user || !good) {
    if (user) await db.auditLog.create({ data: { actor: `ip:${ip}`, action: `${purpose.toLowerCase()}.sign_in_failed`, entity: "User", entityId: user.id } });
    return generic;
  }
  await createSession(user.id, purpose);
  await db.auditLog.create({ data: { actor: purpose === "HQ" ? `hq:${user.id}` : `user:${user.id}`, action: `${purpose.toLowerCase()}.sign_in`, entity: "User", entityId: user.id, after: { ip } } });
  return { ok: true, user };
}

/**
 * Every HQ sign-in is emailed to the account and to HQ's alert channels, so any
 * access to the console is seen straight away.
 */
export async function announceHqSignIn(user: User): Promise<void> {
  const h = await headers();
  const ip = await clientIp();
  const device = (h.get("user-agent") ?? "unknown device").slice(0, 160);
  const when = lagos(new Date());
  const who = user.name ? `${user.name} (${user.email})` : user.email;
  const text = `New sign-in to ${site.name} HQ: ${who}, ${when} (Lagos time), from ${ip}, on ${device}.`;
  if (user.email) {
    await sendEmail(user.email, `${site.name}: new HQ sign-in`, `${text}\n\nIf this wasn't you, reset your password now at ${site.url}/ops/password and tell an HQ owner.`).catch(() => false);
  }
  await alertHq(text, "HQ sign-in");
}
