import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getZones } from "@/lib/catalogue";
import { formatNgPhone } from "@/lib/phone";
import { site } from "@/lib/site";
import { ActionForm } from "@/components/action-form";
import { openStore } from "./actions";

export const metadata: Metadata = {
  title: "Open a store",
  description: `Distributors of ${site.name}: open your own online store. Customers in your areas buy from you and pay into your account.`,
};

export default function JoinPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl sm:text-4xl font-bold">Open your {site.name} store</h1>
      <p className="mt-2 text-muted">
        For distributors who buy their stock from {site.name}. You get a ready-made online store under your business name.
        Customers in your areas choose your store, pay into your bank account, and you deliver or they pick up.
      </p>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}><Join /></Suspense>
    </div>
  );
}

async function Join() {
  const user = await requireUser("/partner/join");
  if (await db.distributorMember.findUnique({ where: { userId: user.id } })) redirect("/partner");
  if (user.roles.includes("OWNER") || user.roles.includes("STAFF")) {
    return <p className="mt-6 rounded-xl bg-promo-soft p-4 text-sm">You&apos;re signed in with an HQ staff account. To open a store, sign out and sign in with the store owner&apos;s email.</p>;
  }
  const zones = (await getZones()).filter((z) => z.kind !== "PICKUP");

  return (
    <>
      <section className="mt-6 card p-5 text-sm">
        <h2 className="font-semibold text-base">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Fill in this form. Your store is created straight away but stays hidden.</li>
          <li>HQ checks your details and approves the store, then records the opening stock you bought from HQ.</li>
          <li>Customers in your areas see your store, order, and pay into your account. You confirm the payment and deliver (or they collect).</li>
        </ol>
        <h2 className="mt-4 font-semibold text-base">Distributor terms</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>You buy stock from {site.name} HQ. HQ records what it delivers to you; your online stock goes down with each sale.</li>
          <li>Your prices must sit inside HQ&apos;s price range for each bag size. You set your own delivery fees.</li>
          <li>HQ charges a fixed fee per bag sold online, shown on your monthly statement.</li>
          <li>Damaged-bag replacements follow {site.name}&apos;s 48-hour policy; HQ replaces those bags for you.</li>
          <li>Only HQ can change the bank account customers pay into after approval, and you&apos;re alerted when it changes.</li>
        </ul>
      </section>

      <ActionForm action={openStore} submit="Open my store" buttonClass="btn-cta" className="mt-6 space-y-6">
        <fieldset className="card p-5 space-y-3 text-sm">
          <legend className="sr-only">Business</legend>
          <h2 className="font-semibold text-base">Your business</h2>
          <label className="block"><span className="font-semibold">Business name</span><span className="block text-xs text-muted">Shown to customers as your store&apos;s name.</span><input name="name" required maxLength={80} className="field" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="font-semibold">Phone</span><input name="phone" type="tel" required defaultValue={user.phone ? formatNgPhone(user.phone) : ""} className="field" /></label>
            <label className="block"><span className="font-semibold">CAC number <span className="font-normal text-muted">(optional)</span></span><input name="cacNumber" maxLength={20} className="field" /></label>
          </div>
          <label className="block"><span className="font-semibold">Shop address</span><textarea name="address" rows={2} required maxLength={200} placeholder="Shop number, market or street, area" className="field" /></label>
          <label className="block"><span className="font-semibold">Opening hours <span className="font-normal text-muted">(optional)</span></span><input name="hours" maxLength={80} placeholder="e.g. Mon–Sat 8am–6pm" className="field" /></label>
        </fieldset>

        <fieldset className="card p-5 space-y-3 text-sm">
          <legend className="sr-only">Bank account</legend>
          <h2 className="font-semibold text-base">Bank account customers pay into</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="font-semibold">Bank</span><input name="bankName" required maxLength={60} className="field" /></label>
            <label className="block"><span className="font-semibold">Account number</span><input name="accountNumber" required inputMode="numeric" pattern="\d{10}" maxLength={10} className="field" /></label>
            <label className="block"><span className="font-semibold">Account name</span><input name="accountName" required maxLength={100} className="field" /></label>
          </div>
        </fieldset>

        <fieldset className="card p-5 space-y-3 text-sm">
          <legend className="sr-only">Delivery and pickup</legend>
          <h2 className="font-semibold text-base">Where you deliver</h2>
          <p className="text-muted">Tick every area you deliver to. Other stores may serve the same areas; customers choose.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {zones.map((z) => (
              <label key={z.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="zone" value={z.id} className="h-4 w-4 accent-[var(--brand)]" />
                <span>{z.name}{z.kind === "NEARBY_TOWN" && <span className="block text-xs text-muted">town, min. order</span>}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="font-semibold">Delivery fee per order ₦</span><input name="baseFee" inputMode="decimal" defaultValue="1500" className="field" /></label>
            <label className="block"><span className="font-semibold">Plus per kg ₦</span><input name="perKgFee" inputMode="decimal" defaultValue="20" className="field" /></label>
          </div>
          <p className="text-xs text-muted">You can set a different fee for each area later, in your portal.</p>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="pickup" defaultChecked className="mt-1 h-4 w-4 accent-[var(--brand)]" />
            <span><strong>Customers can pick up from my shop</strong> (free for them)</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="hqPromotions" className="mt-1 h-4 w-4 accent-[var(--brand)]" />
            <span><strong>Take part in {site.name} promotions</strong><span className="block text-muted">Customers can use HQ promo codes and points coupons at your store. HQ pays those discounts and credits them on your statement. You can change this later.</span></span>
          </label>
        </fieldset>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="agree" required className="mt-1 h-4 w-4 accent-[var(--brand)]" />
          <span>I agree to the distributor terms above.</span>
        </label>
      </ActionForm>
    </>
  );
}
