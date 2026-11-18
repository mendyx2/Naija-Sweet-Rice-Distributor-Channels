import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requirePartner } from "@/lib/partner-auth";
import { formatNaira, koboToNairaInput } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { PartnerNav } from "../partner-nav";
import { createDistributorCode, saveFees, savePrices, saveStoreOptions, stopDistributorCode } from "../actions";
import { ShopLinkCard } from "@/components/shop-link-card";

export default function SettingsPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Settings /></Suspense>;
}

const input = "field mt-0 w-28 py-1.5";

async function Settings() {
  const { distributor, member } = await requirePartner({ ownerOnly: true, next: "/partner/settings" });
  const home = distributor.homeZoneId ? await db.deliveryZone.findUnique({ where: { id: distributor.homeZoneId } }) : null;
  const [variants, prices, zones, codes] = await Promise.all([
    db.variant.findMany({ orderBy: { sizeKg: "desc" } }),
    db.distributorPrice.findMany({ where: { distributorId: distributor.id } }),
    db.deliveryZone.findMany({
      // Areas in the store's state, plus any it already covers elsewhere.
      where: { active: true, kind: { not: "PICKUP" }, OR: [{ state: home?.state ?? "FCT" }, { distributorFees: { some: { distributorId: distributor.id } } }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { distributorFees: { where: { distributorId: distributor.id } } },
    }),
    db.coupon.findMany({ where: { distributorId: distributor.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const now = new Date();
  const p = new Map(prices.map((x) => [x.variantId, x]));
  const range = (min: number | null, max: number | null) =>
    min == null && max == null ? "No range set" : `${min != null ? formatNaira(min) : "any"} – ${max != null ? formatNaira(max) : "any"}`;

  return (
    <>
      <PartnerNav current="settings" name={distributor.name} status={distributor.status} isOwner={member.role === "OWNER"} />
      <h1 className="font-display text-2xl font-bold">Prices &amp; delivery</h1>

      <section className="mt-4 card p-5">
        <h2 className="font-semibold text-lg">Your selling prices</h2>
        <p className="mt-1 text-sm text-muted">Set within HQ&apos;s range. A size without a price isn&apos;t sold by your store online.</p>
        <ActionForm action={savePrices} submit="Save prices" className="mt-3 space-y-3 text-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-muted"><tr><th className="pb-2">Bag</th><th>HQ range</th><th>Retail ₦</th><th>Wholesale ₦ <span className="font-normal">(approved resellers)</span></th></tr></thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="py-2 font-semibold">{v.sizeKg}kg</td>
                    <td className="text-muted whitespace-nowrap pr-3">{range(v.minRetailKobo, v.maxRetailKobo)}</td>
                    <td><input aria-label={`${v.sizeKg}kg retail price`} name={`retail:${v.id}`} inputMode="decimal" defaultValue={koboToNairaInput(p.get(v.id)?.retailPriceKobo)} className={input} /></td>
                    <td><input aria-label={`${v.sizeKg}kg wholesale price`} name={`wholesale:${v.id}`} inputMode="decimal" defaultValue={koboToNairaInput(p.get(v.id)?.wholesalePriceKobo)} className={input} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm>
      </section>

      <section className="mt-6 card p-5">
        <h2 className="font-semibold text-lg">Store options</h2>
        <ActionForm action={saveStoreOptions} submit="Save options" className="mt-3 space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="pickup" defaultChecked={distributor.pickupEnabled} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
            <span><strong>Customers can pick up from my store</strong><span className="block text-muted">At {distributor.address ?? "your shop address"}{distributor.hours ? ` (${distributor.hours})` : ""}. Pickup is free for the customer.</span></span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="hqPromotions" defaultChecked={distributor.joinsHqPromotions} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
            <span><strong>Take part in Naija Sweet Rice promotions</strong><span className="block text-muted">Customers can use HQ promo codes and their points coupons at your store. HQ pays those discounts and credits them on your monthly statement.</span></span>
          </label>
        </ActionForm>
      </section>

      <section className="mt-6 card p-5">
        <h2 className="font-semibold text-lg">Where you deliver, and your fees</h2>
        <p className="mt-1 text-sm text-muted">Tick the areas you deliver to. Customers there will see your store in their list. Fee = base fee + per-kg fee × total kg. You keep the delivery fee. Other stores may serve the same areas.</p>
        {zones.length === 0 ? <p className="mt-3 text-sm text-muted">No delivery areas are open yet.</p> : (
          <ActionForm action={saveFees} submit="Save delivery fees" className="mt-3 space-y-3 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-muted"><tr><th className="pb-2">Deliver here</th><th>Base ₦</th><th>Per kg ₦</th><th>Min kg</th><th>Hours</th><th>Note to customers</th></tr></thead>
                <tbody>
                  {zones.map((z) => {
                    const f = z.distributorFees[0];
                    return (
                      <tr key={z.id} className="border-t border-border">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          <label className="flex items-center gap-2 font-semibold">
                            <input type="checkbox" name={`on:${z.id}`} defaultChecked={!!f} className="h-4 w-4 accent-[var(--brand)]" />
                            {z.name}{z.kind === "NEARBY_TOWN" && <span className="text-xs font-normal text-muted">(town)</span>}
                          </label>
                        </td>
                        <td><input aria-label={`${z.name} base fee`} name={`base:${z.id}`} inputMode="decimal" defaultValue={koboToNairaInput(f?.baseFeeKobo ?? z.baseFeeKobo)} className={input} /></td>
                        <td><input aria-label={`${z.name} per kg`} name={`perKg:${z.id}`} inputMode="decimal" defaultValue={koboToNairaInput(f?.perKgFeeKobo ?? z.perKgFeeKobo)} className="field mt-0 w-20 py-1.5" /></td>
                        <td><input aria-label={`${z.name} minimum kg`} name={`minKg:${z.id}`} inputMode="numeric" defaultValue={f?.minOrderKg ?? ""} className="field mt-0 w-20 py-1.5" /></td>
                        <td><input aria-label={`${z.name} delivery hours`} name={`eta:${z.id}`} inputMode="numeric" defaultValue={f?.etaHours ?? z.etaHours ?? ""} className="field mt-0 w-20 py-1.5" /></td>
                        <td><input aria-label={`${z.name} note`} name={`terms:${z.id}`} defaultValue={f?.terms ?? ""} maxLength={300} className="field mt-0 w-56 py-1.5" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
                      <label className="block max-w-sm"><span className="font-semibold">Add an area in {home?.state === "FCT" || !home ? "Abuja (FCT)" : home.state} that isn&apos;t listed</span>
              <input name="newArea" maxLength={60} placeholder="Area name" className="field" />
              <span className="text-xs text-muted">It&apos;s added with the base and per-kg fee of your first ticked area.</span>
            </label>
</ActionForm>
        )}
      </section>

      <section className="mt-6 card p-5">
        <h2 className="font-semibold text-lg">Your promo codes</h2>
        <p className="mt-1 text-sm text-muted">Discounts you fund yourself, for your customers (e.g. on flyers or WhatsApp). They only work on orders you deliver and aren&apos;t credited back by HQ.</p>
        {codes.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {codes.map((c) => {
              const live = (!c.expiresAt || c.expiresAt > now) && c.usedCount < c.maxUses;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong className="font-mono">{c.code}</strong> · {c.type === "PERCENT" ? `${c.value}% off` : `${formatNaira(c.value)} off`}
                    {c.minOrderKobo ? ` over ${formatNaira(c.minOrderKobo)}` : ""} · used {c.usedCount}{c.maxUses < 100_000 ? `/${c.maxUses}` : ""}
                    <span className={`ml-2 text-xs ${live ? "text-success" : "text-muted"}`}>{live ? "Live" : "Ended"}</span>
                  </span>
                  {live && <form action={stopDistributorCode}><input type="hidden" name="id" value={c.id} /><button className="text-xs underline">Stop</button></form>}
                </li>
              );
            })}
          </ul>
        )}
        <ActionForm action={createDistributorCode} submit="Create code" className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <label className="block"><span className="font-semibold">Code</span><input name="code" required maxLength={20} placeholder="GOVA10" className="field uppercase" /></label>
          <label className="block"><span className="font-semibold">Type</span>
            <select name="type" className="field"><option value="PERCENT">% off</option><option value="FIXED">₦ off</option></select></label>
          <label className="block"><span className="font-semibold">Amount</span><input name="value" required inputMode="decimal" placeholder="10" className="field" /></label>
          <label className="block"><span className="font-semibold">Min order ₦</span><input name="minOrder" inputMode="decimal" className="field" /></label>
          <label className="block"><span className="font-semibold">Max uses</span><input name="maxUses" inputMode="numeric" placeholder="Unlimited" className="field" /></label>
          <label className="block"><span className="font-semibold">Ends</span><input name="endsAt" type="date" className="field" /></label>
        </ActionForm>
      </section>

      <div className="mt-6"><ShopLinkCard slug={distributor.slug} live={zones.length > 0} /></div>

      <p className="mt-6 text-sm text-muted">Shop address, phone, opening hours and bank account are on your <Link href="/partner/profile" className="text-brand underline">Profile</Link>.</p>
    </>
  );
}
