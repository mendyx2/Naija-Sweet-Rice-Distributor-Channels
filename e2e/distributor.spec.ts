import { expect, test, type Page } from "@playwright/test";
import { db, stockOf, zoneId } from "./db";
import { acceptDialogs, chooseArea, GOVA_OWNER, HQ_OWNER, newEmail, signInAs, statusText } from "./helpers";

test.describe.configure({ mode: "serial" });

const summary = (page: Page) => page.getByRole("complementary", { name: "Order summary" });
const store = (page: Page, name: RegExp) => page.getByRole("radio", { name });

test("a Gwarinpa customer compares stores, buys from Gova Max, pays Gova and gets a delivery", async ({ page, browser }) => {
  await signInAs(page.context(), newEmail(), { name: "Tunde Bakare" });
  await page.goto("/");
  await chooseArea(page, await zoneId("Gwarinpa"));
  await page.goto("/p/naija-sweet-rice?size=50");

  // Both stores serving Gwarinpa are listed with their own price; the cheaper in-stock one first.
  const list = page.getByRole("radiogroup", { name: "Stores in Gwarinpa" });
  await expect(list.getByRole("radio")).toHaveCount(2);
  await expect(list.getByRole("radio").first()).toContainText("Gova Max Ltd");
  await expect(store(page, /Gova Max Ltd/)).toContainText("₦84,000");
  await expect(store(page, /Naija Sweet Rice HQ/)).toContainText("₦85,000");
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0); // choose a store first
  await store(page, /Gova Max Ltd/).click();
  await expect(page.getByText(/Sold by Gova Max Ltd/)).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();

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
  await page.goto("/p/naija-sweet-rice?size=25");
  await store(page, /Naija Sweet Rice HQ/).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Increase quantity" }).click(); // 6 bags
  await page.getByRole("button", { name: "Add to cart" }).click();

  await page.goto("/cart");
  await store(page, /Gova Max Ltd/).click(); // Gova has only 4
  await expect(page.locator("main [role=alert]").filter({ hasText: /only 4|4 left/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Checkout" })).toBeDisabled();
  await store(page, /Naija Sweet Rice HQ/).click();
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
  await page.goto("/p/naija-sweet-rice?size=50");
  await store(page, /Gova Max Ltd/).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
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
  await page.goto("/p/naija-sweet-rice?size=50");
  await page.getByRole("button", { name: "Add to cart" }).click();
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
  await page.goto("/p/naija-sweet-rice?size=50");
  await store(page, /Gova Max Ltd/).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.goto("/cart");
  await page.getByRole("radio", { name: "Pickup (free)" }).click();
  await expect(page.getByText("Collect from Gova Max Ltd, Kaura Internal Market")).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByLabel("Street address")).toHaveCount(0);
  await page.getByLabel("Full name").fill("Halima Bello");
  await page.getByRole("button", { name: "Pay ₦84,000" }).click();
  await page.waitForURL(/\/orders\/NSR-/);
  const order = await db.order.findUniqueOrThrow({ where: { number: page.url().split("/").pop()! } });
  expect(order).toMatchObject({ fulfillment: "PICKUP", deliveryFeeKobo: 0, totalKobo: 8_400_000 });
  await expect(page.getByText("Kaura Internal Market, Abuja FCT")).toBeVisible();
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
