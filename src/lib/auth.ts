import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Role, SessionKind, User, SellerProfile } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

const COOKIE = "nsr_session";
const SESSION_DAYS = 30;

export type CurrentUser = User & { sellerProfile: SellerProfile | null };

/**
 * Starts a session. `kind` is what it may open: a customer (email-code)
 * session never opens the distributor portal or HQ. HQ sessions last 12 hours.
 */
export async function createSession(userId: string, kind: SessionKind = "CUSTOMER") {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (kind === "HQ" ? 12 * 3600_000 : SESSION_DAYS * 86400_000));
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await destroySession(); // one session per browser: signing in elsewhere replaces it
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt, userAgent: ua, kind } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

/** Ends every session of this kind for the user except the one in this browser. */
export async function signOutOtherSessions(userId: string, kind: SessionKind) {
  const token = (await cookies()).get(COOKIE)?.value;
  await db.session.deleteMany({ where: { userId, kind, ...(token ? { NOT: { tokenHash: sha256(token) } } : {}) } });
}

/** The signed-in user and what kind of sign-in it is, or null. Cached per request. */
export const getCurrentSession = cache(async (): Promise<{ user: CurrentUser; kind: SessionKind } | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { sellerProfile: true } } },
  });
  await connection(); // expiry depends on the current time: request-time only
  if (!session || session.expiresAt < new Date()) return null;
  return { user: session.user, kind: session.kind };
});

/** The signed-in user (any kind of sign-in), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => (await getCurrentSession())?.user ?? null);

export async function requireUser(next = "/account"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export const hasRole = (u: Pick<User, "roles">, r: Role) => u.roles.includes(r);
export const isApprovedSeller = (u: CurrentUser) => u.sellerProfile?.status === "APPROVED";

/** Only allow same-site relative redirects after login (prevents open redirects). */
export { safeNext } from "./safe-next";

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeReferralCode(name: string | null): string {
  const prefix = (name ?? "").replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase() || "NSR";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  for (const b of bytes) s += REF_ALPHABET[b % REF_ALPHABET.length];
  return `${prefix}${s}`;
}

/**
 * After an order: keep the name and delivery phone on the account if it has none yet.
 * The phone isn't used to sign in, and a number already saved on another account is left alone.
 */
export async function rememberContact(user: Pick<User, "id" | "name" | "phone">, name: string, phone: string) {
  if (!user.name) await db.user.update({ where: { id: user.id }, data: { name } });
  if (!user.phone) await db.user.update({ where: { id: user.id }, data: { phone } }).catch(() => {}); // unique: ignore if taken
}
