import { expect, test } from "@playwright/test";
import { db, zoneId } from "./db";
import { acceptDialogs, HQ_OWNER, loginWithCode, newEmail, signInAs, statusText } from "./helpers";

const PASSWORD = "Rice-hub-2026";

test("a distributor registers with prices and a password; the store stays hidden until HQ approves it", async ({ page, browser }) => {
  const name = `E2E Rice Hub ${Date.now().toString(36).toUpperCase()}`;
  const ownerEmail = newEmail("owner");
  await page.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  acceptDialogs(page);

  // 1. Verify the email, then register: business, prices, bank, areas, password
  await page.goto("/partner/join");
  await expect(page.getByRole("heading", { name: "First, verify your email" })).toBeVisible();
  await loginWithCode(page, ownerEmail);
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("Phone").fill("0803 555 0101");
  await page.getByLabel("Shop address").fill("Shop 12, Utako Market, Abuja");
  await page.getByLabel("Area your shop is in").selectOption({ label: "Utako" });
  await page.getByLabel("Bank", { exact: true }).fill("Access Bank");
  await page.getByLabel("Account number").fill("0691234567");
  await page.getByLabel("Account name").fill("Rice Hub Ventures");
  await page.getByRole("checkbox", { name: "Gwarinpa" }).check();
  await page.getByLabel("Delivery fee per order ₦").fill("1000");
  await page.getByLabel("Your full name").fill("Bola Ade");
  await page.getByLabel("Password", { exact: false }).first().fill(PASSWORD);
  await page.getByLabel("Type it again").fill(PASSWORD);
  await page.getByLabel("I agree to the distributor terms above.").check();
  // Prices must sit inside HQ's range (50kg: ₦83,000–₦88,000)
  await page.getByLabel("50kg price in naira").fill("90000");
  await page.getByRole("button", { name: "Open my store" }).click();
  await expect(page.getByText(/50kg: the price must be between/)).toBeVisible();
  await page.getByLabel("50kg price in naira").fill("83500");
  await page.getByRole("button", { name: "Open my store" }).click();
  await page.waitForURL(/\/partner$/);
  await expect(page.getByText("Your store is waiting for HQ approval.")).toBeVisible();
  const store = await db.distributor.findFirstOrThrow({ where: { name }, include: { prices: { include: { variant: true } } } });
  expect(store).toMatchObject({ status: "PENDING", pickupEnabled: true, joinsHqPromotions: false, accountNumber: "0691234567" });
  expect(store.prices.map((p) => [p.variant.sizeKg, p.retailPriceKobo])).toEqual([[50, 8_350_000]]);

  // The distributor portal has its own sign-in: sign out, then back in with the password.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/partner/login");
  await page.getByLabel("Email address").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("don't match");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/partner$/);

  // A customer (email-code) sign-in doesn't open the distributor portal.
  const cust = await browser.newContext();
  await signInAs(cust, ownerEmail, { kind: "CUSTOMER" });
  const cp = await cust.newPage();
  await cp.goto("/partner/stock");
  await cp.waitForURL(/\/partner\/login/);

  // While waiting, the owner corrects their own shop details and bank account on their profile.
  await page.goto("/partner/profile");
  const shop = page.locator("section", { has: page.getByRole("heading", { name: "Shop details" }) });
  await shop.getByLabel("Shop address").fill("Shop 14, Utako Market, Abuja");
  await shop.getByLabel("Account number").fill("0691234568");
  await shop.getByRole("button", { name: "Save shop details" }).click();
  await expect(statusText(page, /Shop details saved/)).toBeVisible();
  expect(await db.distributor.findUniqueOrThrow({ where: { id: store.id } })).toMatchObject({ address: "Shop 14, Utako Market, Abuja", accountNumber: "0691234568" });

  // 2. Hidden from customers while pending
  const shopper = await (await browser.newContext()).newPage();
  await shopper.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  const gwarinpa = `/stores?area=${await zoneId("Gwarinpa")}`;
  await shopper.goto(gwarinpa);
  await expect(shopper.getByRole("region", { name: /stores? for Gwarinpa/ })).toBeVisible();
  await expect(shopper.getByRole("button", { name: new RegExp(name) })).toHaveCount(0);
  await shopper.goto(`/stores/${store.slug}`);
  await expect(shopper.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

  // 3. HQ approves and records the opening stock
  const hctx = await browser.newContext();
  await signInAs(hctx, HQ_OWNER);
  const ops = await hctx.newPage();
  acceptDialogs(ops);
  await ops.goto("/ops/distributors");
  await expect(ops.locator("li", { hasText: name })).toContainText("Waiting for approval");
  await ops.goto(`/ops/distributors/${store.id}`);
  await expect(ops.getByText("New store waiting for approval")).toBeVisible();
  await ops.getByRole("button", { name: "Approve store" }).click();
  await expect(ops.getByText(/^Approved .* Record their opening stock below/)).toBeVisible();
  expect((await db.distributor.findUniqueOrThrow({ where: { id: store.id } })).status).toBe("ACTIVE");
  await ops.getByLabel("Send 50kg").fill("8");
  await ops.getByRole("button", { name: "Dispatch from HQ" }).click();
  await expect(statusText(ops, /Dispatched 8 × 50kg/)).toBeVisible();

  // 4. The distributor confirms the delivery; the store is now live in Gwarinpa
  // After approval the bank account can only be changed by HQ.
  await page.goto("/partner/profile");
  await expect(page.getByText("only HQ can change this now")).toBeVisible();
  await expect(page.getByLabel("Account number")).toHaveCount(0);
  await page.goto("/partner/stock");
  await expect(page.getByText("Your store is waiting for HQ approval.")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm received" }).click();
  await expect(page.getByText("Last delivery from HQ")).toBeVisible();

  await shopper.goto(gwarinpa);
  await shopper.getByRole("region", { name: /stores for Gwarinpa/ }).getByRole("button", { name: new RegExp(name) }).click();
  await shopper.waitForURL(`**/stores/${store.slug}`);
  await expect(shopper.getByRole("listitem", { name: "50kg bag" })).toContainText("₦83,500");
  // A size the store didn't price is offered from HQ instead.
  const small = shopper.getByRole("listitem", { name: "25kg bag" });
  await expect(small).toContainText("Currently unavailable here");
  await expect(small.getByRole("link", { name: "Order from Naija Sweet Rice HQ" })).toHaveAttribute("href", "/stores/hq?size=25");

  await db.distributor.update({ where: { id: store.id }, data: { status: "REJECTED" } }); // keep later tests' store lists stable
});
