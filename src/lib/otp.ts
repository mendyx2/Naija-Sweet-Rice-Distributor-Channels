import "server-only";
import { db } from "./db";
import { hashIp, hmac, randomDigits, safeEqual } from "./crypto";
import { isEmailConfigured, sendEmail } from "./email";
import { site } from "./site";

/**
 * Sign-in codes, sent by email for the soft launch (SMS can be added back
 * later as a second way to receive the same code).
 */
const CODE_TTL_MS = 10 * 60_000;
const MAX_SENDS_PER_EMAIL_15M = 3;
const MAX_SENDS_PER_EMAIL_DAY = 10;
const MAX_VERIFY_ATTEMPTS = 5;

const codeHash = (email: string, code: string) => hmac(`otp:${email}:${code}`);

export type OtpSendResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: "TOO_MANY" | "SEND_FAILED" };

export async function sendOtp(email: string, ip: string): Promise<OtpSendResult> {
  const now = Date.now();
  const [recent, today] = await Promise.all([
    db.otpCode.count({ where: { email, createdAt: { gte: new Date(now - 15 * 60_000) } } }),
    db.otpCode.count({ where: { email, createdAt: { gte: new Date(now - 24 * 3600_000) } } }),
  ]);
  if (recent >= MAX_SENDS_PER_EMAIL_15M || today >= MAX_SENDS_PER_EMAIL_DAY) return { ok: false, error: "TOO_MANY" };

  const code = randomDigits(6);
  await db.otpCode.create({
    data: { email, codeHash: codeHash(email, code), expiresAt: new Date(now + CODE_TTL_MS), ipHash: hashIp(ip) },
  });
  const sent = await sendEmail(
    email,
    `${code} is your ${site.name} sign-in code`,
    `Your ${site.name} sign-in code is ${code}.\n\nIt expires in 10 minutes. Don't share it with anyone: our staff will never ask for it.\n\nIf you didn't try to sign in, you can ignore this email.`,
  );
  if (!sent) return { ok: false, error: "SEND_FAILED" };

  // Shown on screen ONLY in local development without an email provider.
  const devCode = process.env.NODE_ENV !== "production" && !isEmailConfigured() ? code : undefined;
  return { ok: true, devCode };
}

export type OtpVerifyResult = { ok: true } | { ok: false; error: "INVALID" | "EXPIRED" | "TOO_MANY_ATTEMPTS" };

export async function verifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  const otp = await db.otpCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt.getTime() < Date.now()) return { ok: false, error: "EXPIRED" };
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) return { ok: false, error: "TOO_MANY_ATTEMPTS" };

  if (!/^\d{6}$/.test(code) || !safeEqual(otp.codeHash, codeHash(email, code))) {
    await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: otp.attempts + 1 >= MAX_VERIFY_ATTEMPTS ? "TOO_MANY_ATTEMPTS" : "INVALID" };
  }
  // Consume atomically so a code can only be used once.
  const { count } = await db.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return count === 1 ? { ok: true } : { ok: false, error: "EXPIRED" };
}
