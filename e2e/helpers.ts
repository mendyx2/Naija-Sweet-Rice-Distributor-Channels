import { createHash, randomBytes } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { db } from "./db";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let counter = 0;
const stamp = () => `${Date.now().toString(36)}${++counter}`;
/** A fresh Nigerian mobile number per call, so tests never collide. */
export const newPhone = () => `0809${String(Date.now() % 10_000_000).padStart(7, "0").slice(-5)}${String(++counter).padStart(2, "0")}`;
/** A fresh email address per call (people sign in with email). */
export const newEmail = (who = "shopper") => `${who}.${stamp()}@example.test`;
const e164 = (local: string) => `+234${local.replace(/\D/g, "").replace(/^0/, "")}`;

/** Fixed people from global-setup / playwright.config. */
export const HQ_OWNER = "owner@naijasweetrice.test"; // in HQ_OWNER_EMAILS
export const GOVA_OWNER = "musa@govamax.test";

type Kind = "CUSTOMER" | "PARTNER" | "HQ";

/**
 * Signs a browser in as this email without the code/password step (creates the user if needed).
 * New customers get a phone number too, as if they had ordered before, unless `phone: null`.
 * The kind of session follows the person: HQ for HQ owners/staff, PARTNER for distributor
 * team members, otherwise a customer session. Pass `kind` to choose.
 */
export async function signInAs(context: BrowserContext, email: string, opts: { name?: string; roles?: ("OWNER" | "STAFF")[]; phone?: string | null; kind?: Kind } = {}) {
  const phone = opts.phone === null ? null : e164(opts.phone ?? newPhone());
  const user = await db.user.upsert({
    where: { email },
    create: { email, phone, name: opts.name ?? null, referralCode: `T${randomBytes(4).toString("hex").toUpperCase()}`, roles: ["BUYER", ...(opts.roles ?? [])] },
    update: opts.roles ? { roles: ["BUYER", ...opts.roles] } : {},
  });
  const member = await db.distributorMember.findUnique({ where: { userId: user.id } });
  const kind: Kind = opts.kind
    ?? (email === HQ_OWNER || user.roles.includes("OWNER") || user.roles.includes("STAFF") ? "HQ" : member ? "PARTNER" : "CUSTOMER");
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { tokenHash: sha(token), userId: user.id, kind, expiresAt: new Date(Date.now() + 86400_000) } });
  await context.addCookies([{ name: "nsr_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(() => { try { localStorage.setItem("nsr_consent", "denied"); } catch {} });
  return user;
}

/** Real login through the email + code screen (development mode shows the code on screen). */
export async function loginWithCode(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = (await page.getByText("your code is").locator("strong").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify & continue" }).click();
}

export async function chooseArea(page: Page, zoneId: string) {
  await page.evaluate((z) => localStorage.setItem("nsr_zone", z), zoneId);
}

/** Accepts the browser confirm() prompts used before important actions. */
export const acceptDialogs = (page: Page) => page.on("dialog", (d) => d.accept());

export const statusText = (page: Page, re: RegExp) => page.locator("main [role=status]").filter({ hasText: re }).first();

/** A one-time password link for this person, as if it had been emailed (returns the page URL). */
export async function passwordLinkFor(email: string, purpose: "HQ" | "PARTNER") {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  await db.passwordToken.create({ data: { userId: user.id, purpose, tokenHash: sha(token), expiresAt: new Date(Date.now() + 3600_000) } });
  return `/${purpose === "HQ" ? "ops" : "partner"}/password?token=${token}`;
}

/** Opens a store's page and adds bags of one size to the cart. */
export async function addFromStore(page: Page, slug: string, sizeKg: number, qty = 1) {
  await page.goto(`/stores/${slug}`);
  const card = page.getByRole("listitem", { name: `${sizeKg}kg bag` });
  for (let i = 1; i < qty; i++) await card.getByRole("button", { name: "Increase quantity" }).click();
  await card.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("status").filter({ hasText: /Added \d+ × / }).waitFor();
}
