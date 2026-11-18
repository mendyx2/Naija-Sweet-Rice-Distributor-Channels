import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getStoreShop } from "@/lib/store-shop";
import { formatNgPhone } from "@/lib/phone";
import { site } from "@/lib/site";
import { stateLabel } from "@/lib/states";
import { JsonLd } from "@/components/json-ld";
import { ShareWhatsApp } from "@/components/share-whatsapp";
import { StoreShop } from "./store-shop";

export async function generateMetadata({ params }: PageProps<"/stores/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: slug === "hq" ? `${site.name} HQ store` : `Store: ${slug.replace(/-/g, " ")}`,
    description: `Buy ${site.name} online from an authorised store: its prices for 50kg, 25kg, 5kg and 1kg bags, delivery or free pickup.`,
    alternates: { canonical: `/stores/${slug}` },
  };
}

export default function StorePage({ params }: PageProps<"/stores/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-12 h-96" />}>
      <Store params={params} />
    </Suspense>
  );
}

async function Store({ params }: Pick<PageProps<"/stores/[slug]">, "params">) {
  const { slug } = await params;
  const s = await getStoreShop(slug);
  if (!s) notFound();
  const url = `${site.url}/stores/${s.slug}`;
  const states = [...new Set(s.areas.map((a) => a.state))];

  return (
    <div>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "GroceryStore", name: s.name, url,
        telephone: s.phone || undefined,
        address: s.address ? { "@type": "PostalAddress", streetAddress: s.address, addressRegion: s.home?.state ?? "FCT", addressCountry: "NG" } : undefined,
        areaServed: s.areas.map((a) => ({ "@type": "Place", name: `${a.name}, ${stateLabel(a.state)}` })),
        brand: { "@type": "Brand", name: site.name },
      }} />

      <section className="relative overflow-hidden bg-brand-strong text-white">
        <div className="grain-overlay absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="text-sm text-white/75">
            <Link href="/stores" className="underline underline-offset-4">Find a store</Link> <span aria-hidden="true">/</span> {s.name}
          </nav>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
            <span className="h-2 w-2 rounded-full bg-cta" aria-hidden="true" /> {s.isHq ? "Naija Sweet Rice flagship" : "Authorised Naija Sweet Rice store"}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold mt-3">{s.name}</h1>
          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm text-white/90 sm:grid-cols-3">
            {s.address && <div><dt className="text-white/60">Shop</dt><dd className="font-semibold">{s.address}{s.home ? ` (${s.home.name}, ${stateLabel(s.home.state)})` : ""}</dd></div>}
            {s.hours && <div><dt className="text-white/60">Open</dt><dd className="font-semibold">{s.hours}</dd></div>}
            {s.phone && <div><dt className="text-white/60">Phone</dt><dd className="font-semibold"><a className="underline" href={`tel:${s.phone}`}>{formatNgPhone(s.phone)}</a></dd></div>}
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ShareWhatsApp text={`Buy ${site.name} from ${s.name}:`} url={url} label="Share this store" />
            {s.pickup && <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">Free pickup</span>}
            {s.areas.length > 0 && <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">Delivers to {s.areas.length} area{s.areas.length === 1 ? "" : "s"}</span>}
            {s.joinsHqPromotions && <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">Accepts Naija Sweet Rice coupons</span>}
          </div>
        </div>
        <div className="pattern-band" aria-hidden="true" />
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="font-display text-2xl sm:text-3xl font-bold">Choose your bags</h2>
        <p className="mt-1 text-muted">Prices set by {s.name}. You&apos;ll choose delivery or pickup in your cart, then pay by transfer to this store.</p>
        <div className="mt-6">
          <StoreShop
            store={{ id: s.id, name: s.name, isHq: s.isHq }}
            sizes={s.sizes}
            areaIds={s.areas.map((a) => a.id)}
            homeAreaId={s.home?.id ?? null}
            pickup={s.pickup}
          />
        </div>

        {s.areas.length > 0 && (
          <section className="mt-12" aria-labelledby="delivers">
            <h2 id="delivers" className="font-semibold text-lg">Delivers to</h2>
            {states.map((st) => (
              <p key={st} className="mt-2 text-sm text-muted">
                <strong className="text-foreground">{stateLabel(st)}:</strong> {s.areas.filter((a) => a.state === st).map((a) => a.name).join(", ")}
              </p>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
