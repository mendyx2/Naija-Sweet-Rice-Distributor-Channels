import { Suspense } from "react";
import { db } from "@/lib/db";
import { requirePartner } from "@/lib/partner-auth";
import { formatNgPhone } from "@/lib/phone";
import { ActionForm } from "@/components/action-form";
import { PartnerNav } from "../partner-nav";
import { changeMyPassword, saveMyName, saveShopDetails } from "../actions";

export default function ProfilePage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Profile /></Suspense>;
}

async function Profile() {
  const { user, distributor, member } = await requirePartner({ next: "/partner/profile" });
  const isOwner = member.role === "OWNER";
  const home = distributor.homeZoneId ? await db.deliveryZone.findUnique({ where: { id: distributor.homeZoneId } }) : null;
  const zones = isOwner
    ? await db.deliveryZone.findMany({ where: { active: true, kind: { not: "PICKUP" }, state: home?.state ?? "FCT" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
    : [];

  return (
    <>
      <PartnerNav current="profile" name={distributor.name} status={distributor.status} isOwner={isOwner} />
      <h1 className="font-display text-2xl font-bold">Profile</h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section className="card p-5 text-sm">
          <h2 className="font-semibold text-lg">Your account</h2>
          <p className="mt-1 text-muted">Signed in as <strong className="text-foreground">{user.email}</strong> · {isOwner ? "Store owner" : "Staff"}</p>
          <ActionForm action={saveMyName} submit="Save name" className="mt-3 space-y-3">
            <label className="block"><span className="font-semibold">Your full name</span><input name="name" required maxLength={80} defaultValue={user.name ?? ""} autoComplete="name" className="field" /></label>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">To change your sign-in email, ask HQ.</p>
        </section>

        <section className="card p-5 text-sm">
          <h2 className="font-semibold text-lg">Change password</h2>
          <ActionForm action={changeMyPassword} submit="Change password" className="mt-3 space-y-3">
            <label className="block"><span className="font-semibold">Current password</span><input name="current" type="password" required autoComplete="current-password" className="field" /></label>
            <label className="block"><span className="font-semibold">New password</span><input name="password" type="password" required minLength={10} autoComplete="new-password" className="field" />
              <span className="mt-1 block text-xs text-muted">At least 10 characters, with a letter and a number.</span></label>
            <label className="block"><span className="font-semibold">Type the new one again</span><input name="confirm" type="password" required autoComplete="new-password" className="field" /></label>
          </ActionForm>
        </section>
      </div>

      {isOwner ? (
        <section className="mt-6 card p-5 text-sm">
        <h2 className="font-semibold text-lg">Shop details</h2>
        <p className="mt-1 text-muted">Shown to customers on your store page and for pickup. One shop per store.</p>
        <ActionForm action={saveShopDetails} submit="Save shop details" className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="font-semibold">Phone</span><input name="phone" type="tel" required defaultValue={distributor.phone ? formatNgPhone(distributor.phone) : ""} className="field" /></label>
            <label className="block"><span className="font-semibold">Opening hours</span><input name="hours" maxLength={80} defaultValue={distributor.hours ?? ""} placeholder="e.g. Mon–Sat 8am–6pm" className="field" /></label>
          </div>
          <label className="block"><span className="font-semibold">Shop address</span><textarea name="address" rows={2} required maxLength={200} defaultValue={distributor.address ?? ""} className="field" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="font-semibold">Area your shop is in ({home?.state === "FCT" || !home ? "Abuja (FCT)" : home.state})</span>
              <select name="homeZoneId" defaultValue={home?.id ?? ""} className="field">
                <option value="">Choose…</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="font-semibold">Or a new area <span className="font-normal text-muted">(if not listed)</span></span><input name="newHomeArea" maxLength={60} className="field" /></label>
          </div>
          {distributor.status === "PENDING" ? (
            <fieldset className="space-y-3 rounded-xl border border-border p-3">
              <legend className="px-1 font-semibold">Bank account customers pay into</legend>
              <p className="text-muted">You can correct this until HQ approves your store. After that, only HQ can change it.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block"><span className="font-semibold">Bank</span><input name="bankName" required defaultValue={distributor.bankName ?? ""} className="field" /></label>
                <label className="block"><span className="font-semibold">Account number</span><input name="accountNumber" required inputMode="numeric" maxLength={10} defaultValue={distributor.accountNumber ?? ""} className="field" /></label>
                <label className="block"><span className="font-semibold">Account name</span><input name="accountName" required defaultValue={distributor.accountName ?? ""} className="field" /></label>
              </div>
            </fieldset>
          ) : (
            <div className="rounded-xl bg-background p-3">
              <p className="font-semibold">Bank account customers pay into</p>
              {distributor.accountNumber
                ? <p className="mt-1">{distributor.bankName} · <strong className="tracking-wider">{distributor.accountNumber}</strong> · {distributor.accountName}</p>
                : <p className="mt-1 text-danger">Not set yet. Contact HQ.</p>}
              <p className="mt-1 text-muted">For your security, only HQ can change this now. Contact HQ to update it.</p>
            </div>
          )}
        </ActionForm>
      </section>
      ) : (
        <p className="mt-6 text-sm text-muted">The store owner manages the shop&apos;s address, phone and bank details.</p>
      )}
    </>
  );
}
