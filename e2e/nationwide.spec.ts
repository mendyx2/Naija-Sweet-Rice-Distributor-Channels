import { expect, test } from "@playwright/test";
import { db } from "./db";
import { acceptDialogs, HQ_OWNER, newEmail, signInAs, statusText } from "./helpers";

test("stores anywhere in Nigeria: a Lagos store's areas show under Lagos once HQ approves it", async ({ page, browser }) => {
  const name = `E2E Lagos Rice ${Date.now().toString(36).toUpperCase()}`;
  await signInAs(page.context(), newEmail("lagos"), { name: "Kemi Ade", phone: null });
  acceptDialogs(page);

  await page.goto("/partner/join");
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("Phone").fill("0805 555 0202");
  await page.getByLabel("Shop address").fill("12 Allen Avenue, Ikeja, Lagos");
  // Retry until the form has hydrated and shows Lagos's areas.
  await expect(async () => {
    await page.locator("select[name=state]").selectOption("Lagos");
    await expect(page.getByText("Areas you deliver to in Lagos")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByLabel("Area your shop is in").selectOption({ label: "My area isn't listed: add it" });
  await page.getByLabel("Name of your area").fill("Ikeja");
  await page.getByLabel(/areas you deliver to \(/i).fill("ogba, Agege");
  await page.getByLabel("Bank", { exact: true }).fill("Wema Bank");
  await page.getByLabel("Account number").fill("0123456780");
  await page.getByLabel("Account name").fill("Lagos Rice Ventures");
  await page.getByLabel("50kg price in naira").fill("86000");
  await page.getByLabel("Your full name").fill("Kemi Ade");
  await page.getByLabel("Password", { exact: false }).first().fill("Lagos-rice-2026");
  await page.getByLabel("Type it again").fill("Lagos-rice-2026");
  await page.getByLabel("I agree to the distributor terms above.").check();
  await page.getByRole("button", { name: "Open my store" }).click();
  await page.waitForURL(/\/partner$/);

  const store = await db.distributor.findFirstOrThrow({ where: { name }, include: { homeZone: true, zoneFees: { include: { zone: true } } } });
  expect(store.homeZone).toMatchObject({ name: "Ikeja", state: "Lagos", kind: "AREA" });
  expect(store.zoneFees.map((f) => f.zone.name).sort()).toEqual(["Agege", "Ikeja", "Ogba"]); // typed names tidied; shop's area included

  // Hidden while waiting for approval
  const shopper = await (await browser.newContext()).newPage();
  await shopper.context().addInitScript(() => localStorage.setItem("nsr_consent", "denied"));
  await shopper.goto("/stores?state=Lagos");
  await expect(shopper.getByRole("status").filter({ hasText: "No stores found" })).toBeVisible();

  // HQ approves and sends stock
  const hctx = await browser.newContext();
  await signInAs(hctx, HQ_OWNER);
  const ops = await hctx.newPage();
  acceptDialogs(ops);
  await ops.goto(`/ops/distributors/${store.id}`);
  await ops.getByRole("button", { name: "Approve store" }).click();
  await expect(ops.getByText(/^Approved /)).toBeVisible();
  await ops.getByLabel("Send 50kg").fill("4");
  await ops.getByRole("button", { name: "Dispatch from HQ" }).click();
  await expect(statusText(ops, /Dispatched 4 × 50kg/)).toBeVisible();
  await page.goto("/partner/stock");
  await page.getByRole("button", { name: "Confirm received" }).click();
  await expect(page.getByText("Last delivery from HQ")).toBeVisible();

  // The Lagos filter now shows every area with a store there, and nothing from Abuja
  await shopper.goto("/stores?state=Lagos");
  const lagos = shopper.getByRole("region", { name: "Lagos" });
  for (const area of ["Ikeja", "Ogba", "Agege"]) await expect(lagos.getByRole("listitem", { name: `${area}, Lagos` })).toContainText(name);
  await expect(lagos.getByRole("listitem", { name: "Ikeja, Lagos" })).toContainText("Shop in this area");
  await expect(shopper.getByRole("region", { name: "Abuja (FCT)" })).toHaveCount(0);
  // Searching by area finds it from "All states" too
  await shopper.goto("/stores?q=ikeja");
  await expect(shopper.getByRole("listitem", { name: "Ikeja, Lagos" })).toBeVisible();
  // All states: Abuja and Lagos both listed
  await shopper.goto("/stores");
  await expect(shopper.getByRole("region", { name: "Abuja (FCT)" })).toBeVisible();
  await expect(shopper.getByRole("region", { name: "Lagos" })).toBeVisible();

  // The area picker: Lagos → Ikeja shows the Lagos store only (HQ doesn't deliver to Lagos)
  await shopper.getByRole("banner").getByRole("button", { name: "Choose your area" }).click();
  await shopper.locator("#area-picker-state").selectOption("Lagos");
  await expect(shopper.locator("#area-picker option")).toHaveText(["Choose your area…", "Agege", "Ikeja", "Ogba"]);
  await shopper.locator("#area-picker").selectOption({ label: "Ikeja" });
  await shopper.getByRole("button", { name: "Save area" }).click();
  await shopper.goto("/stores?state=Lagos");
  await shopper.getByRole("listitem", { name: "Ikeja, Lagos" }).getByRole("button", { name: `Buy from ${name}` }).click();
  await shopper.waitForURL(`**/stores/${store.slug}`);
  const bag = shopper.getByRole("listitem", { name: "50kg bag" });
  await expect(bag).toContainText("₦86,000");
  await expect(bag.getByRole("button", { name: "Add to cart" })).toBeVisible();

  await db.distributor.update({ where: { id: store.id }, data: { status: "REJECTED" } });
});
