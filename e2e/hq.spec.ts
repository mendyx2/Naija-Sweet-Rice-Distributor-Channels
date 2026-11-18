import { expect, test } from "@playwright/test";
import { db } from "./db";
import { GOVA_OWNER, HQ_OWNER, newEmail, passwordLinkFor, signInAs, statusText } from "./helpers";

const HQ_PASSWORD = "Hq-owner-2026";

test.describe.configure({ mode: "serial" });

test("customer and distributor sign-ins can't open HQ screens", async ({ page, browser }) => {
  await signInAs(page.context(), newEmail());
  await page.goto("/ops/prices");
  await page.waitForURL(/\/ops\/login/);
  // Even an HQ owner's customer (email-code) session isn't an HQ sign-in.
  const c = await browser.newContext();
  await signInAs(c, HQ_OWNER, { kind: "CUSTOMER" });
  const p = await c.newPage();
  await p.goto("/ops/orders");
  await p.waitForURL(/\/ops\/login/);
});

test("the HQ owner sets a password from an emailed link, signs in with it, and manages the team; staff have limited access", async ({ page, browser }) => {
  await page.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  // First time: ask for a link (HQ_OWNER is in HQ_OWNER_EMAILS).
  await page.goto("/ops/password");
  await page.getByLabel("Email address").fill(HQ_OWNER);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("status")).toContainText("sent a link");
  await expect.poll(() => db.passwordToken.count({ where: { user: { email: HQ_OWNER }, purpose: "HQ" } })).toBeGreaterThan(0);
  // The emailed link (a fresh one, made here as the email itself isn't readable in tests).
  await page.goto(await passwordLinkFor(HQ_OWNER, "HQ"));
  await page.getByLabel("New password").fill("lettersonlypassword");
  await page.getByLabel("Type it again").fill("lettersonlypassword");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("one letter and one number");
  await page.getByLabel("New password").fill(HQ_PASSWORD);
  await page.getByLabel("Type it again").fill(HQ_PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL("**/ops/login?set=1");

  await page.getByLabel("Email address").fill(HQ_OWNER);
  await page.getByLabel("Password", { exact: true }).fill(HQ_PASSWORD);
  const signIns = await db.auditLog.count({ where: { action: "hq.sign_in" } });
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/ops/orders");
  expect(await db.auditLog.count({ where: { action: "hq.sign_in" } })).toBe(signIns + 1); // every sign-in is recorded and announced
  await expect(page.getByRole("link", { name: "HQ team" })).toBeVisible();

  const staffEmail = newEmail("ada");
  await page.goto("/ops/team");
  await page.getByLabel("Name").fill("Ada Obi");
  await page.getByLabel("Email address").fill(staffEmail);
  await page.getByRole("button", { name: "Give HQ access" }).click();
  await expect(statusText(page, /added as staff/)).toBeVisible();

  await page.getByLabel("Name").fill("Musa");
  await page.getByLabel("Email address").fill(GOVA_OWNER); // Gova Max owner
  await page.getByRole("button", { name: "Give HQ access" }).click();
  await expect(statusText(page, /distributor team/)).toBeVisible();

  const sctx = await browser.newContext();
  await signInAs(sctx, staffEmail);
  const staff = await sctx.newPage();
  await staff.goto("/ops/orders");
  await expect(staff.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(staff.getByRole("link", { name: "HQ team" })).toHaveCount(0);
  await staff.goto("/ops/team");
  await expect(staff.getByText("That page is for HQ owners only.")).toBeVisible();
  const gova = await db.distributor.findUniqueOrThrow({ where: { slug: "gova-max-ltd" } });
  await staff.goto(`/ops/distributors/${gova.id}`);
  await expect(staff.getByText("Only HQ owners can change bank details.")).toBeVisible();
  await expect(staff.getByRole("button", { name: "Save bank details" })).toHaveCount(0);

  await page.reload();
  await page.locator("li", { hasText: "Ada Obi" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("li", { hasText: "Ada Obi" })).toHaveCount(0);
  await staff.goto("/ops/orders");
  await staff.waitForURL(/\/ops\/login/);
});

test("the network map shows who covers each area, with a table of the same facts", async ({ page, context }) => {
  await signInAs(context, HQ_OWNER, { name: "HQ Owner", roles: ["OWNER"] });
  await page.goto("/ops/network");
  await expect(page.getByRole("heading", { name: "Network map" })).toBeVisible();
  await expect(page.getByRole("group", { name: /Schematic map of Abuja/ })).toBeVisible();
  const areas = page.locator("section", { hasText: "Stores (besides HQ)" });
  await expect(areas.getByRole("row", { name: /^Gwarinpa Gova Max Ltd/ })).toBeVisible();
  await expect(areas.getByRole("row", { name: /^Garki none/ })).toBeVisible();
  await expect(areas.getByRole("row", { name: /^Suleja · min order none/ })).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/network-mobile.png`, fullPage: true });
});
