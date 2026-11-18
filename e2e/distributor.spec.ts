import { expect, test, type Page } from "@playwright/test";
import { db, stockOf, zoneId } from "./db";
import { acceptDialogs, addFromStore, chooseArea, GOVA_OWNER, HQ_OWNER, newEmail, signInAs, statusText } from "./helpers";

test.describe.configure({ mode: "serial" });

const summary = (page: Page) => page.getByRole("complementary", { name: "Order summary" });
const store = (page: Page, name: RegExp) => page.getByRole("radio", { name });

test("a Gwarinpa customer compares stores, buys from Gova Max, pays Gova and gets a delivery", async ({ page, browser }) => {
  await signInAs(page.context(), newEmail(), { name: "Tunde Bakare" });
  await page.goto("/");
  await chooseArea(page, await zoneId("Gwarinpa"));
  // Find a store: both stores serving Gwarinpa are listed; each store page has its own prices.
  await page.goto(`/stores?area=${await zoneId("Gwarinpa")}`);
  const picked = page.getByRole("region", { name: /2 stores for Gwarinpa/ });
  await expect(picked.getByRole("button", { name: /Naija Sweet Rice HQ/ })).toBeVisible();
  await page.goto("/stores/hq");
  await expect(page.getByRole("listitem", { name: "50kg bag" })).toContainText("₦85,000");
  await page.goto(`/stores?area=${await zoneId("Gwarinpa")}`);
  await picked.getByRole("button", { name: /Gova Max Ltd/ }).click();
  await page.waitForURL("**/stores/gova-max-ltd");
  const bag = page.getByRole("listitem", { name: "50kg bag" });
  await expect(bag).toContainText("₦84,000");
  await bag.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 1 × 50kg from Gova Max Ltd" })).toBeVisible();

  await page.goto("/cart");
  await expect(store(page, /Gova Max Ltd/)).toHaveAttribute("aria-checked", "true");
  await expect(summary(page).locator("dl")).toContainText("₦2,500"); // Gova's fee: ₦1,500 + ₦20 × 50kg
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(summary(page)).toContainText("Sold and delivered by Gova Max Ltd");
  await page.getByLabel("Full name").fill("Tunde Bakare");
  await page.getByLabel("Street address").fill("12 Road 3, Gwarinpa Estate");
  const before = (await stockOf("gova-max-ltd", 50)).onHand;
  await page.getByRole("button", { name: /^Pay ₦/ }).click();
  await page.waitForURL(/\/orders\/NSR-/);
  const number = page.url().split("/").pop()!;
  await expect(page.locator("section", { hasText: "Pay by bank transfer" })).toContainText("0234567891");
  await page.getByRole("button", { name: "I've made the transfer" }).click();
  await expect(page.getByText("Waiting for the seller to confirm")).toBeVisible();

  const gctx = await browser.newContext();
  await signInAs(gctx, GOVA_OWNER);
  const gp = await gctx.newPage();
  acceptDialogs(gp);
  await gp.goto("/partner?f=pay");
  await gp.locator("li", { hasText: number }).getByRole("button", { name: "Payment received" }).click();
  await expect(gp.locator("li", { hasText: number }).getByText("Transfer confirmed")).toBeVisible();

  const gova = await db.distributor.findUniqueOrThrow({ where: { slug: "gova-max-ltd" } });
  const order = await db.order.findUniqueOrThrow({ where: { number } });
  expect(order).toMatchObject({ status: "PAID", distributorId: gova.id, fulfillment: "DELIVERY", hqFeeKobo: 50_000 });
  expect((await stockOf("gova-max-ltd", 50)).onHand).toBe(before - 1);

  await gp.goto("/partner?f=todo");
  for (const status of ["OUT_FOR_DELIVERY", "DELIVERED"]) {
    const card = gp.locator("li", { hasText: number });
    await card.locator("select[name=status]").selectOption(status);
    if (status === "OUT_FOR_DELIVERY") await card.locator("input[name=riderName]").fill("Sani");
    await card.getByRole("button", { name: "Update & notify" }).click();
    await expect.poll(async () => (await db.order.findUniqueOrThrow({ where: { number } })).status).toBe(status);
  }
});

test("when the chosen store is short, the customer switches to another store in the cart", async ({ page }) => {
  await signInAs(page.context(), newEmail());
  await page.goto("/");
  await chooseArea(page, await zoneId("Gwarinpa"));
  await addFromStore(page, "gova-max-ltd", 25, 6); // Gova has only 4

  await page.goto("/cart");
  await expect(store(page, /Gova Max Ltd/)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Not available in this quantity at Gova Max Ltd", { exact: false })).toBeVisible();
  await expect(page.locator("main").getByText(/only 4|4 left|4 in stock/i)).toHaveCount(0); // no stock numbers for buyers
  await expect(page.getByRole("button", { name: "Checkout" })).toBeDisabled();
  await page.getByRole("button", { name: "Order from Naija Sweet Rice HQ instead" }).click();
  await expect(store(page, /Naija Sweet Rice HQ/)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("link", { name: "Checkout" })).toBeVisible();
});

test("coupons: a store's own codes work only there; HQ coupons only at stores that joined HQ promotions", async ({ page, browser }) => {
  const gctx = await browser.newContext();
  await signInAs(gctx, GOVA_OWNER);
  const gp = await gctx.newPage();
  await gp.goto("/partner/settings");
  const code = `GT${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await gp.getByLabel("Code", { exact: true }).fill(code);
  await gp.getByLabel("Amount", { exact: true }).fill("10");
  await gp.getByRole("button", { name: "Create code" }).click();
  await expect(statusText(gp, /is live/)).toBeVisible();
  const hqCode = `HQ${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await db.coupon.create({ data: { code: hqCode, type: "FIXED", value: 200_000, maxUses: 100, source: "PROMO" } });

  await signInAs(page.context(), newEmail(), { name: "Ada Customer" });
  await page.goto("/");
  await chooseArea(page, await zoneId("Gwarinpa"));
  await addFromStore(page, "gova-max-ltd", 50);
  await page.goto("/cart");
  const apply = async (c: string) => {
    await page.getByPlaceholder("Coupon code").fill(c.toLowerCase());
    await page.getByRole("button", { name: "Apply" }).click();
  };

  // HQ's code at Gova, which hasn't joined HQ promotions yet.
  await apply(hqCode);
  await expect(page.getByText("doesn't take part in Naija Sweet Rice promotions")).toBeVisible();
  // Gova's own code: fine at Gova, refused at HQ.
  await apply(code);
  await expect(page.getByText(`Coupon ${code} applied`)).toBeVisible();
  await expect(summary(page).locator("dl")).toContainText("−₦8,400");
  await store(page, /Naija Sweet Rice HQ/).click();
  await expect(page.getByText("belongs to a different store")).toBeVisible();
  await store(page, /Gova Max Ltd/).click();
  await expect(page.getByText(`Coupon ${code} applied`)).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Full name").fill("Ada Customer");
  await page.getByLabel("Street address").fill("3 Kubwa Road");
  await page.getByRole("button", { name: /^Pay ₦/ }).click();
  await page.waitForURL(/\/orders\/NSR-/);
  const order = await db.order.findUniqueOrThrow({ where: { number: page.url().split("/").pop()! } });
  expect(order).toMatchObject({ discountKobo: 840_000, hqFundedDiscountKobo: 0 });

  // Gova joins HQ promotions: HQ's code now works there, and HQ pays for it.
  await gp.goto("/partner/settings");
  await gp.getByLabel(/Take part in Naija Sweet Rice promotions/).check();
  await gp.getByRole("button", { name: "Save options" }).click();
  await expect(statusText(gp, /promotions accepted/)).toBeVisible();
  await addFromStore(page, "gova-max-ltd", 50);
  await page.goto("/cart");
  await apply(hqCode);
  await expect(page.getByText(`Coupon ${hqCode} applied`)).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Full name").fill("Ada Customer");
  await page.getByLabel("Street address").fill("3 Kubwa Road");
  await page.getByRole("button", { name: /^Pay ₦/ }).click();
  await page.waitForURL(/\/orders\/NSR-/);
  const order2 = await db.order.findUniqueOrThrow({ where: { number: page.url().split("/").pop()! } });
  expect(order2).toMatchObject({ discountKobo: 200_000, hqFundedDiscountKobo: 200_000 });
  await db.distributor.update({ where: { slug: "gova-max-ltd" }, data: { joinsHqPromotions: false } });
});

test("pickup from Gova's shop: no delivery fee, no address, collected at Kaura market", async ({ page }) => {
  await signInAs(page.context(), newEmail(), { name: "Halima Bello" });
  await page.goto("/");
  await chooseArea(page, await zoneId("Kubwa"));
  await addFromStore(page, "gova-max-ltd", 50);
  await page.goto("/cart");
  await page.getByRole("radio", { name: "Pickup (free)" }).click();
  await expect(page.getByText("Collect from Gova Max Ltd, Kaura International Market")).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByLabel("Street address")).toHaveCount(0);
  await page.getByLabel("Full name").fill("Halima Bello");
  await page.getByRole("button", { name: "Pay ₦84,000" }).click();
  await page.waitForURL(/\/orders\/NSR-/);
  const order = await db.order.findUniqueOrThrow({ where: { number: page.url().split("/").pop()! } });
  expect(order).toMatchObject({ fulfillment: "PICKUP", deliveryFeeKobo: 0, totalKobo: 8_400_000 });
  await expect(page.getByText("Kaura International Market, Abuja FCT")).toBeVisible();
});

test("customers in Kaura see Gova's shop for pickup, even though Gova doesn't deliver there", async ({ page }) => {
  await signInAs(page.context(), newEmail());
  await page.goto("/");
  await chooseArea(page, await zoneId("Kaura"));
  await page.goto(`/stores?area=${await zoneId("Kaura")}`);
  const gova = page.getByRole("region", { name: /for Kaura/ }).getByRole("button", { name: /Gova Max Ltd/ });
  await expect(gova).toContainText("Kaura International Market, Abuja FCT");
  await expect(gova).toContainText("Shop in this area");
  await expect(gova).toContainText("Free pickup");
  await gova.click();
  await page.waitForURL("**/stores/gova-max-ltd");
  await page.getByRole("listitem", { name: "50kg bag" }).getByRole("button", { name: "Add to cart" }).click();
  await page.goto("/cart");
  // Delivery isn't possible from Gova here, so pickup is chosen for the customer.
  await expect(page.getByRole("radio", { name: "Pickup (free)" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Delivery", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Checkout" })).toBeVisible();
});

test("stock: HQ records bags delivered to Gova, Gova confirms what arrived", async ({ browser }) => {
  const hctx = await browser.newContext();
  await signInAs(hctx, HQ_OWNER);
  const ops = await hctx.newPage();
  acceptDialogs(ops);
  const gova = await db.distributor.findUniqueOrThrow({ where: { slug: "gova-max-ltd" } });
  const hqBefore = (await stockOf("hq", 50)).onHand;
  await ops.goto(`/ops/distributors/${gova.id}`);
  await ops.getByLabel("Send 50kg").fill("5");
  await ops.getByRole("button", { name: "Dispatch from HQ" }).click();
  await expect(statusText(ops, /Sent|dispatched/i)).toBeVisible();
  expect((await stockOf("hq", 50)).onHand).toBe(hqBefore - 5);

  const gctx = await browser.newContext();
  await signInAs(gctx, GOVA_OWNER);
  const gp = await gctx.newPage();
  const govaBefore = (await stockOf("gova-max-ltd", 50)).onHand;
  await gp.goto("/partner/stock");
  await expect(gp.getByText("Order and pay for stock with Naija Sweet Rice HQ directly")).toBeVisible();
  await gp.getByRole("button", { name: "Confirm received" }).click();
  await expect(gp.getByText("Last delivery from HQ")).toBeVisible();
  expect((await stockOf("gova-max-ltd", 50)).onHand).toBe(govaBefore + 5);
});
