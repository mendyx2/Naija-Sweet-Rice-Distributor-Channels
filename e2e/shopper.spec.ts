import { expect, test } from "@playwright/test";
import { db, zoneId } from "./db";
import { HQ_OWNER, acceptDialogs, addFromStore, chooseArea, loginWithCode, newEmail, newPhone, signInAs } from "./helpers";

test("order from an HQ area, sign in with an email code, pay by transfer, HQ confirms", async ({ page, browser }) => {
  await page.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  await page.goto("/");
  await chooseArea(page, await zoneId("Garki"));
  // Find a store for Garki: only HQ delivers there.
  await page.goto(`/stores?area=${await zoneId("Garki")}`);
  const picked = page.getByRole("region", { name: /1 store for Garki/ });
  await picked.getByRole("button", { name: /Naija Sweet Rice HQ/ }).click();
  await page.waitForURL("**/stores/hq");
  const bag = page.getByRole("listitem", { name: "50kg bag" });
  await expect(bag).toContainText("₦85,000");
  await expect(page.getByText(/\d+ (bags? )?(left|in stock)/i)).toHaveCount(0); // buyers never see stock levels
  await bag.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: /Cart, 1 item/ })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("complementary", { name: "Order summary" }).getByRole("radio", { name: /Naija Sweet Rice HQ/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("link", { name: "Checkout" }).click();
  const email = newEmail();
  await loginWithCode(page, email);
  await page.getByLabel("Full name").fill("Ngozi Eze");
  await page.getByLabel("Phone for delivery").fill(newPhone()); // new accounts have no phone yet
  await page.getByLabel("Street address").fill("14 Ahmadu Bello Way, Garki");
  await page.getByRole("button", { name: /^Pay ₦/ }).click();

  await page.waitForURL(/\/orders\/NSR-/);
  const number = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "Pay by bank transfer" })).toBeVisible();
  await expect(page.locator("section", { hasText: "Pay by bank transfer" })).toContainText("1012345678");
  await expect(page.locator("section", { hasText: "Pay by bank transfer" })).toContainText(number);
  await page.getByRole("button", { name: "I've made the transfer" }).click();
  await expect(page.getByText("Waiting for the seller to confirm")).toBeVisible();

  const hq = await browser.newContext();
  await signInAs(hq, HQ_OWNER);
  const ops = await hq.newPage();
  acceptDialogs(ops);
  await ops.goto("/ops/orders?f=unpaid");
  const card = ops.locator("li", { hasText: number });
  await expect(card).toContainText("Customer says they transferred");
  await card.getByRole("button", { name: "Payment received" }).click();
  await expect(ops.locator("li", { hasText: number }).getByText("Transfer confirmed")).toBeVisible();

  const order = await db.order.findUniqueOrThrow({ where: { number } });
  expect(order.status).toBe("PAID");
  expect(order.distributorId).toBe("hq");
  expect(order.contactEmail).toBe(email); // payment details and updates are emailed here
  expect((await db.user.findUniqueOrThrow({ where: { email } })).phone).toMatch(/^\+234/); // delivery phone saved to the account
  await page.reload();
  await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible();
});

test("nearby towns enforce the minimum order", async ({ page }) => {
  await page.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  await page.goto("/");
  await chooseArea(page, await zoneId("Suleja"));
  await addFromStore(page, "hq", 25);
  await page.goto("/cart");
  await expect(page.locator("main [role=alert]").filter({ hasText: "minimum" })).toContainText("50kg");
  await expect(page.getByRole("button", { name: "Checkout" })).toBeDisabled();
});

test("free 1kg sample, picked up free from the store, needs no payment", async ({ page }) => {
  await signInAs(page.context(), newEmail(), { name: "Chidi Okafor" });
  await page.goto("/samples");
  await page.locator("#zone").selectOption({ label: "Garki" });
  await expect(page.getByRole("radio", { name: /Naija Sweet Rice HQ/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Pickup (free)" }).click();
  await expect(page.getByText("From Naija Sweet Rice HQ")).toBeVisible();
  await page.getByRole("button", { name: "Get my free sample" }).click();
  await page.waitForURL(/\/orders\/NSR-/);
  const order = await db.order.findUniqueOrThrow({ where: { number: page.url().split("/").pop()! } });
  expect(order).toMatchObject({ type: "SAMPLE", status: "PAID", totalKobo: 0, fulfillment: "PICKUP", distributorId: "hq" });
  await page.goto("/samples");
  await expect(page.getByText("You've requested your sample")).toBeVisible();
});
