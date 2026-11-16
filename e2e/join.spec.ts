import { expect, test } from "@playwright/test";
import { db, zoneId } from "./db";
import { acceptDialogs, chooseArea, HQ_OWNER, newEmail, signInAs, statusText } from "./helpers";

test("a distributor opens a store; it stays hidden until HQ approves it and adds stock", async ({ page, browser }) => {
  const name = `E2E Rice Hub ${Date.now().toString(36).toUpperCase()}`;
  const ownerEmail = newEmail("owner");
  await signInAs(page.context(), ownerEmail, { name: "Bola Ade", phone: null });
  acceptDialogs(page);

  // 1. Sign up
  await page.goto("/partner/join");
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("Phone").fill("0803 555 0101");
  await page.getByLabel("Shop address").fill("Shop 12, Utako Market, Abuja");
  await page.getByLabel("Area your shop is in").selectOption({ label: "Utako" });
  await page.getByLabel("Bank", { exact: true }).fill("Access Bank");
  await page.getByLabel("Account number").fill("0691234567");
  await page.getByLabel("Account name").fill("Rice Hub Ventures");
  await page.getByRole("checkbox", { name: "Gwarinpa" }).check();
  await page.getByLabel("Delivery fee per order ₦").fill("1000");
  await page.getByLabel("I agree to the distributor terms above.").check();
  await page.getByRole("button", { name: "Open my store" }).click();
  await page.waitForURL("**/partner/settings");
  await expect(page.getByText("Your store is waiting for HQ approval.")).toBeVisible();
  const store = await db.distributor.findFirstOrThrow({ where: { name } });
  expect(store).toMatchObject({ status: "PENDING", pickupEnabled: true, joinsHqPromotions: false, accountNumber: "0691234567" });

  // Set a price while waiting (inside HQ's 50kg range of ₦83,000–₦88,000).
  await page.getByLabel("50kg retail price").fill("83500");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(statusText(page, /saved/i)).toBeVisible();

  // 2. Hidden from customers while pending
  const shopper = await (await browser.newContext()).newPage();
  await shopper.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  await shopper.goto("/");
  await chooseArea(shopper, await zoneId("Gwarinpa"));
  await shopper.goto("/p/naija-sweet-rice?size=50");
  await expect(shopper.getByRole("radiogroup", { name: "Stores in Gwarinpa" })).toBeVisible();
  await expect(shopper.getByRole("radio", { name: new RegExp(name) })).toHaveCount(0);

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
  await page.goto("/partner/stock");
  await expect(page.getByText("Your store is waiting for HQ approval.")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm received" }).click();
  await expect(page.getByText("Last delivery from HQ")).toBeVisible();

  await shopper.reload();
  const listed = shopper.getByRole("radio", { name: new RegExp(name) });
  await expect(listed).toContainText("₦83,500");
  await expect(listed).toContainText("Delivery ₦1,000");
  await expect(shopper.getByRole("radiogroup", { name: "Stores in Gwarinpa" }).getByRole("radio").first()).toContainText(name); // cheapest first

  await db.distributor.update({ where: { id: store.id }, data: { status: "REJECTED" } }); // keep later tests' store lists stable
});
