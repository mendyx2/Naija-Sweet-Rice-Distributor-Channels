import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getStoreDirectory, type DirectoryArea } from "@/lib/distributors-public";
import { site } from "@/lib/site";
import { isNigerianState, NIGERIAN_STATES, sortStates, stateLabel } from "@/lib/states";
import { formatNgPhone } from "@/lib/phone";
import { ShopButton } from "./shop-button";
import { FindStoreBox } from "@/components/find-store-box";
import { getShoppingAreas } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Find a store",
  description: `Find authorised ${site.name} stores across Nigeria. Choose your state to see every area with a store, then buy online for delivery or pickup.`,
  alternates: { canonical: "/stores" },
};

export default function StoresPage({ searchParams }: PageProps<"/stores">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl sm:text-4xl font-bold">Find a store</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Authorised {site.name} stores across Nigeria. Choose your state to see every area with a store,
        then shop online for delivery or free pickup. Each store sets its own prices and delivery fees.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading stores…</p>}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function Directory({ searchParams }: Pick<PageProps<"/stores">, "searchParams">) {
  const sp = await searchParams;
  const directory = await getStoreDirectory();
  const states = sortStates(directory.map((a) => a.state));
  const state = typeof sp.state === "string" && isNigerianState(sp.state) ? sp.state : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const words = norm(q).split(" ").filter(Boolean);

  // Typing a state's name ("lagos", "abuja") filters by that state too.
  const matches = (a: DirectoryArea) => {
    if (state && a.state !== state) return false;
    if (!words.length) return true;
    const hay = norm([a.name, a.state, stateLabel(a.state), ...a.stores.flatMap((s) => [s.name, s.address ?? ""])].join(" "));
    return words.every((w) => hay.includes(w));
  };
  const areas = directory.filter(matches);
  const byState = sortStates(areas.map((a) => a.state)).map((s) => ({ state: s, areas: areas.filter((a) => a.state === s) }));
  const storeCount = new Set(areas.flatMap((a) => a.stores.map((s) => s.id))).size;
  const picked = typeof sp.area === "string" ? directory.find((a) => a.id === sp.area) ?? null : null;
  const zones = await getShoppingAreas();

  return (
    <>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] items-start">
        <FindStoreBox zones={zones} id="stores-find" />
        {picked ? (
          <section aria-labelledby="picked" className="rounded-3xl bg-brand-soft p-5 sm:p-6">
            <h2 id="picked" className="font-display text-2xl font-bold text-brand">
              {picked.stores.length} store{picked.stores.length === 1 ? "" : "s"} for {picked.name}, {stateLabel(picked.state)}
            </h2>
            <p className="text-sm text-muted">Pick a store to see its prices and order.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {picked.stores.map((st) => (
                <li key={st.id}>
                  <ShopButton zoneId={picked.id} storeId={st.id} href={`/stores/${st.slug}`}
                    className="tilt-card block w-full rounded-2xl bg-surface p-4 text-left shadow-sm">
                    <span className="block font-display text-lg font-bold">{st.name}</span>
                    {st.address && <span className="block text-sm text-muted">{st.address}</span>}
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {st.shopHere && <span className="font-semibold text-brand">Shop in this area</span>}
                      {st.deliversHere && <span>Delivers here</span>}
                      {st.pickup && st.shopHere && <span>Free pickup</span>}
                    </span>
                    <span className="mt-3 inline-block font-semibold text-brand">Visit store →</span>
                  </ShopButton>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="rounded-3xl bg-brand-soft p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold text-brand">Buy from an authorised store</h2>
            <ol className="mt-3 space-y-1 text-sm">
              <li>1. Choose your state and area.</li>
              <li>2. Pick a store: each one sets its own prices and delivery fee.</li>
              <li>3. Add your bags, pay the store by transfer, and get your receipt by email.</li>
            </ol>
          </section>
        )}
      </div>

      <h2 className="mt-10 font-display text-2xl font-bold">All stores</h2>
      <form method="get" className="mt-4 card p-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end" role="search">
        <label className="block text-sm">
          <span className="font-semibold">State</span>
          <select name="state" defaultValue={state} className="field">
            <option value="">All states</option>
            {sortStates(NIGERIAN_STATES).map((s) => <option key={s} value={s}>{stateLabel(s)}{states.includes(s) ? "" : " (no stores yet)"}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-semibold">Area or store</span>
          <input name="q" type="search" defaultValue={q} placeholder="e.g. Gwarinpa, Ikeja, Kaura market" className="field" />
        </label>
        <button className="btn-primary py-3">Search</button>
      </form>

      <nav aria-label="States with stores" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/stores" aria-current={!state ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 ${!state ? "bg-brand text-white" : "border border-border hover:bg-brand-soft"}`}>All</Link>
        {states.map((s) => (
          <Link key={s} href={`/stores?state=${encodeURIComponent(s)}`} aria-current={state === s ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 ${state === s ? "bg-brand text-white" : "border border-border hover:bg-brand-soft"}`}>
            {stateLabel(s)}
          </Link>
        ))}
      </nav>

      <p className="mt-6 text-sm text-muted" role="status">
        {areas.length
          ? `${storeCount} store${storeCount === 1 ? "" : "s"} in ${areas.length} area${areas.length === 1 ? "" : "s"}${state ? ` in ${stateLabel(state)}` : ""}${q ? ` matching "${q}"` : ""}.`
          : `No stores found${state ? ` in ${stateLabel(state)}` : ""}${q ? ` for "${q}"` : ""} yet.`}
        {!areas.length && <> <Link href="/stores" className="text-brand underline">See all stores</Link>, or order on WhatsApp.</>}
      </p>

      {byState.map(({ state: s, areas: list }) => (
        <section key={s} className="mt-8" aria-labelledby={`state-${s}`}>
          <h2 id={`state-${s}`} className="font-display text-2xl font-bold text-brand">{stateLabel(s)}</h2>
          <ul className="mt-3 grid gap-4 md:grid-cols-2">
            {list.map((a) => (
              <li key={a.id} className="card p-5" aria-label={`${a.name}, ${stateLabel(a.state)}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-lg">{a.name}</h3>
                  <ShopButton zoneId={a.id} href={`/stores?area=${a.id}`} className="text-sm font-semibold text-brand underline">Shop in {a.name} →</ShopButton>
                </div>
                <ul className="mt-3 space-y-3">
                  {a.stores.map((st) => (
                    <li key={st.id} className="rounded-xl bg-background p-3 text-sm">
                      <p className="font-semibold">
                        {st.isHq ? st.name : <Link href={`/stores/${st.slug}`} className="hover:underline">{st.name}</Link>}
                      </p>
                      {st.address && <p className="text-muted">{st.address}</p>}
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {st.shopHere && <span className="font-semibold text-brand">Shop in this area</span>}
                        {st.deliversHere && <span>Delivers here</span>}
                        {st.pickup && st.shopHere && <span>Free pickup</span>}
                        {st.phone && <a className="underline" href={`tel:${st.phone}`}>{formatNgPhone(st.phone)}</a>}
                      </p>
                      <ShopButton zoneId={a.id} storeId={st.id} href={`/stores/${st.slug}`} className="mt-2 text-xs font-semibold text-brand underline">Buy from {st.name}</ShopButton>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 rounded-2xl bg-brand-soft p-4 text-sm">
        Are you a {site.name} distributor? <Link href="/partner/join" className="font-semibold text-brand underline">Open your store</Link> and customers in your state will find you here.
      </p>
    </>
  );
}
