import { test as setup } from "@playwright/test";
import { HQ_OWNER, signInAs } from "./helpers";

/**
 * The dev server compiles each page the first time it's requested and may
 * reload open pages while it does. Visiting every page once up front keeps
 * that out of the real tests.
 */
const PAGES = [
  "/", "/stores/hq", "/cart", "/checkout", "/stores", "/delivery", "/delivery/gwarinpa",
  "/stores/gova-max-ltd", "/promotions", "/samples", "/track", "/login", "/register", "/faq", "/privacy", "/terms",
  "/returns-policy", "/account", "/orders/NSR-WARMUP", "/orders/NSR-WARMUP/replace",
  "/partner", "/partner/join", "/partner/no-access", "/partner/stock", "/partner/sales", "/partner/settings",
  "/partner/reports", "/partner/staff", "/partner/alerts", "/partner/profile", "/partner/login", "/partner/password",
  "/ops/login", "/ops/password", "/ops/orders", "/ops/stock", "/ops/distributors", "/ops/distributors/hq", "/ops/network", "/ops/statements",
  "/ops/returns", "/ops/reports", "/ops/prices", "/ops/zones", "/ops/partners", "/ops/promotions", "/ops/team",
];

setup("compile every page once", async ({ page }) => {
  setup.setTimeout(600_000);
  await signInAs(page.context(), HQ_OWNER);
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "load", timeout: 120_000 }).catch(() => {});
  }
  await page.waitForTimeout(2000); // let any last reload settle
});
