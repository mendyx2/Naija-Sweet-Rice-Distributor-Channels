import { execSync } from "node:child_process";
import { E2E_DB } from "../playwright.config";
import { db } from "./db";

/**
 * Prepares the test database WITHOUT wiping it: applies migrations, loads the
 * normal starting data (seed, idempotent), then sets the fixtures below to
 * known values. Tests create their own uniquely-named customers and codes,
 * so repeated runs don't collide.
 */
export default async function globalSetup() {
  if (!/e2e|test/i.test(new URL(E2E_DB).pathname)) {
    throw new Error(`Refusing to use ${E2E_DB}: the end-to-end database name must contain "e2e" or "test".`);
  }
  const env = { ...process.env, DATABASE_URL: E2E_DB };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });

  const v = Object.fromEntries((await db.variant.findMany()).map((x) => [x.sizeKg, x]));
  const kobo = (naira: number) => naira * 100;

  // HQ prices, distributor ranges, distributor price, HQ per-bag fee, HQ stock
  const prices: Record<number, { retail: number; was?: number; min?: number; max?: number; cost?: number; fee?: number }> = {
    50: { retail: 85_000, min: 83_000, max: 88_000, cost: 78_000, fee: 500 },
    25: { retail: 43_000, min: 41_000, max: 45_000, cost: 39_000, fee: 300 },
    5: { retail: 9_500, was: 10_500 },
    1: { retail: 1_500, cost: 1_000 },
  };
  for (const [kg, p] of Object.entries(prices)) {
    const id = v[Number(kg)].id;
    await db.variant.update({
      where: { id },
      data: { retailPriceKobo: kobo(p.retail), compareAtPriceKobo: p.was ? kobo(p.was) : null, minRetailKobo: p.min ? kobo(p.min) : null,
        maxRetailKobo: p.max ? kobo(p.max) : null, distributorCostKobo: p.cost ? kobo(p.cost) : null, active: true },
    });
    const fee = await db.hqFeeRate.findFirst({ where: { variantId: id }, orderBy: { effectiveFrom: "desc" } });
    if (p.fee && fee?.feeKobo !== kobo(p.fee)) await db.hqFeeRate.create({ data: { variantId: id, feeKobo: kobo(p.fee), setBy: "e2e" } });
    await db.distributorStock.update({ where: { distributorId_variantId: { distributorId: "hq", variantId: id } }, data: { onHand: 200, held: 0, inTransit: 0 } });
  }
  await db.distributor.update({
    where: { id: "hq" },
    data: { bankName: "Zenith Bank", accountNumber: "1012345678", accountName: "Naija Sweet Rice Ltd", address: "Plot 1 Aminu Kano Crescent, Wuse II, Abuja", pickupEnabled: true },
  });
  // Stores opened by earlier test runs stay out of the way.
  await db.distributor.updateMany({ where: { name: { startsWith: "E2E " } }, data: { status: "REJECTED" } });

  // A test distributor, "Gova Max Ltd" (the real one signs itself up; the site doesn't pre-load
  // distributors): Gwarinpa + Kubwa, own prices and fees, known stock, an owner login.
  const govaData = {
    status: "ACTIVE" as const, phone: "+2348120004444", bankName: "GTBank", accountNumber: "0234567891", accountName: "Gova Max Ltd",
    address: "Kaura International Market, Abuja FCT", pickupEnabled: true, joinsHqPromotions: false,
    homeZone: { connect: { slug: "kaura" } },
  };
  const gova = await db.distributor.upsert({
    where: { slug: "gova-max-ltd" },
    create: { name: "Gova Max Ltd", slug: "gova-max-ltd", approvedAt: new Date(), approvedBy: "e2e", ...govaData },
    update: govaData,
  });
  const govaAreas = await db.deliveryZone.findMany({ where: { name: { in: ["Gwarinpa", "Kubwa"] } } });
  await db.distributorZoneFee.deleteMany({ where: { distributorId: gova.id, zoneId: { notIn: govaAreas.map((z) => z.id) } } });
  for (const z of govaAreas) {
    const fee = { baseFeeKobo: kobo(1_500), perKgFeeKobo: kobo(20), etaHours: 24, minOrderKg: null, minOrderKobo: null };
    await db.distributorZoneFee.upsert({ where: { distributorId_zoneId: { distributorId: gova.id, zoneId: z.id } }, create: { distributorId: gova.id, zoneId: z.id, ...fee }, update: fee });
  }
  for (const [kg, naira] of [[50, 84_000], [25, 42_500]] as const) {
    const data = { retailPriceKobo: kobo(naira), wholesalePriceKobo: null };
    await db.distributorPrice.upsert({ where: { distributorId_variantId: { distributorId: gova.id, variantId: v[kg].id } }, create: { distributorId: gova.id, variantId: v[kg].id, ...data }, update: data });
  }
  for (const [kg, qty] of [[50, 10], [25, 4], [5, 0], [1, 5]] as const) {
    const stock = { onHand: qty, held: 0, inTransit: 0 };
    await db.distributorStock.upsert({ where: { distributorId_variantId: { distributorId: gova.id, variantId: v[kg].id } }, create: { distributorId: gova.id, variantId: v[kg].id, ...stock }, update: stock });
  }
  // Gova's owner signs in with email; an older test database may have them saved by phone only.
  const existing = await db.user.findFirst({ where: { OR: [{ email: "musa@govamax.test" }, { phone: "+2348120003333" }] } });
  const owner = existing
    ? await db.user.update({ where: { id: existing.id }, data: { email: "musa@govamax.test", phone: "+2348120003333", roles: ["BUYER"] } })
    : await db.user.create({ data: { email: "musa@govamax.test", phone: "+2348120003333", name: "Musa Gova", referralCode: "GOVAOWNER1" } });
  await db.distributorMember.upsert({ where: { userId: owner.id }, create: { userId: owner.id, distributorId: gova.id, role: "OWNER" }, update: { distributorId: gova.id, role: "OWNER" } });

  // Leftovers from an interrupted earlier run
  await db.telegramChat.deleteMany({ where: { chatId: "5551" } });
  await db.otpCode.deleteMany({});
  await db.$disconnect();
}
