import { describe, expect, it } from "vitest";
import { canFill, couponStoreIssue, hqFeeFor, sortStores, withinBand, type Offer } from "@/lib/network-rules";

const fee = { baseFeeKobo: 100_000, perKgFeeKobo: 2_000, minOrderKg: null, minOrderKobo: null, etaHours: 24, terms: null };
const v = (variantId: string, price: number | null, available: number) =>
  ({ variantId, sizeKg: Number(variantId), retailPriceKobo: price, wholesalePriceKobo: null, available, active: true });
const offer = (id: string, isHq: boolean, variants: ReturnType<typeof v>[], extra: Partial<Offer> = {}): Offer =>
  ({ distributorId: id, slug: id, name: id, isHq, ready: true, address: null, hours: null, pickup: true, joinsHqPromotions: isHq, fee, variants, ...extra });

const gova = offer("Gova", false, [v("50", 8_400_000, 10), v("5", 950_000, 0)]);
const hq = offer("HQ", true, [v("50", 8_500_000, 40), v("5", 950_000, 60)]);
const kubwa = offer("Kubwa Foods", false, [v("50", 8_300_000, 0), v("5", 900_000, 5)], { fee: { ...fee, baseFeeKobo: 50_000 } });

describe("store list for an area", () => {
  it("puts stores with the chosen size in stock first, then the cheapest", () => {
    expect(sortStores([hq, kubwa, gova], "50").map((o) => o.name)).toEqual(["Gova", "HQ", "Kubwa Foods"]);
    expect(sortStores([hq, kubwa, gova], "5").map((o) => o.name)).toEqual(["Kubwa Foods", "HQ", "Gova"]);
  });
  it("breaks price ties by the lower delivery fee, and doesn't favour HQ", () => {
    const twin = offer("Twin", false, [v("50", 8_500_000, 3)], { fee: { ...fee, baseFeeKobo: 10_000 } });
    expect(sortStores([hq, twin], "50").map((o) => o.name)).toEqual(["Twin", "HQ"]);
  });
  it("knows whether a store can supply the whole cart", () => {
    expect(canFill(gova, [{ variantId: "50", qty: 10 }])).toBe(true);
    expect(canFill(gova, [{ variantId: "50", qty: 11 }])).toBe(false);
    expect(canFill(gova, [{ variantId: "5", qty: 1 }])).toBe(false);
    expect(canFill({ ...gova, ready: false }, [{ variantId: "50", qty: 1 }])).toBe(false);
  });
});

describe("which coupons a store accepts", () => {
  const govaStore = { distributorId: "Gova", isHq: false, joinsHqPromotions: false };
  it("accepts a store's own codes only at that store", () => {
    expect(couponStoreIssue({ distributorId: "Gova" }, govaStore)).toBeNull();
    expect(couponStoreIssue({ distributorId: "Gova" }, { distributorId: "hq", isHq: true, joinsHqPromotions: true })).toBe("COUPON_WRONG_SELLER");
  });
  it("accepts HQ codes and points coupons at HQ and at stores that joined HQ promotions", () => {
    expect(couponStoreIssue({ distributorId: null }, { distributorId: "hq", isHq: true, joinsHqPromotions: false })).toBeNull();
    expect(couponStoreIssue({ distributorId: null }, govaStore)).toBe("COUPON_STORE_NOT_IN_PROMO");
    expect(couponStoreIssue({ distributorId: null }, { ...govaStore, joinsHqPromotions: true })).toBeNull();
  });
});

describe("price range and HQ fee", () => {
  it("checks distributor prices against HQ's range", () => {
    expect(withinBand(8_400_000, 8_300_000, 8_800_000)).toBe(true);
    expect(withinBand(8_200_000, 8_300_000, 8_800_000)).toBe(false);
    expect(withinBand(9_000_000, null, 8_800_000)).toBe(false);
    expect(withinBand(null, null, null)).toBe(false);
  });
  it("charges the fixed per-bag fee on distributor sales only", () => {
    const fees = new Map([["50", 50_000], ["5", 10_000]]);
    expect(hqFeeFor([{ variantId: "50", qty: 2 }, { variantId: "5", qty: 3 }], fees, false)).toBe(130_000);
    expect(hqFeeFor([{ variantId: "50", qty: 2 }], fees, true)).toBe(0);
  });
});

import { currentMonth, isMonth, monthRange } from "@/lib/statement-dates";
describe("statement months (Lagos time)", () => {
  it("starts and ends at midnight in Lagos", () => {
    const r = monthRange("2026-11");
    expect(r.from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(monthRange("2026-12").to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
  it("knows the current Lagos month and validates input", () => {
    expect(currentMonth(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12");
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("x")).toBe(false);
  });
});
