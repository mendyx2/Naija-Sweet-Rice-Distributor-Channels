import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPublicDistributors } from "@/lib/distributors-public";
import { formatNgPhone } from "@/lib/phone";
import { site } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { ShopHere } from "./shop-here";

export async function generateStaticParams() {
  const list = await getPublicDistributors();
  return list.length ? list.map((d) => ({ slug: d.slug })) : [{ slug: "_none" }];
}

async function find(slug: string) {
  return (await getPublicDistributors()).find((d) => d.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/distributors/[slug]">): Promise<Metadata> {
  const d = await find((await params).slug);
  if (!d) return {};
  const areas = d.zones.map((z) => z.name).join(", ") || d.home?.name || "Abuja";
  return {
    title: `${d.name}: authorised ${site.name} store, ${areas}`,
    description: `Buy ${site.name} from ${d.name}, an authorised store delivering to ${areas}, Abuja. Order online for delivery${d.pickup ? " or pickup" : ""}.`,
    alternates: { canonical: `/distributors/${d.slug}` },
  };
}

export default function DistributorPage({ params }: PageProps<"/distributors/[slug]">) {
  return <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-12 h-96" />}><Distributor params={params} /></Suspense>;
}

async function Distributor({ params }: Pick<PageProps<"/distributors/[slug]">, "params">) {
  const d = await find((await params).slug);
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "GroceryStore", name: d.name, url: `${site.url}/distributors/${d.slug}`,
        telephone: d.phone || undefined, address: d.address ? { "@type": "PostalAddress", streetAddress: d.address, addressRegion: "FCT", addressCountry: "NG" } : undefined,
        areaServed: d.zones.map((z) => ({ "@type": "Place", name: `${z.name}, Abuja` })),
        brand: { "@type": "Brand", name: site.name },
      }} />
      <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" /> Authorised {site.name} distributor
      </p>
      <h1 className="font-display text-4xl sm:text-5xl font-bold mt-3">{d.name}</h1>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3 text-sm">
        {d.address && <div className="card p-4"><dt className="text-muted">Shop{d.pickup ? " (free pickup)" : ""}</dt><dd className="mt-1 font-semibold">{d.address}</dd>{d.home && <dd className="text-sm text-muted">{d.home.name}</dd>}</div>}
        {d.hours && <div className="card p-4"><dt className="text-muted">Opening hours</dt><dd className="mt-1 font-semibold">{d.hours}</dd></div>}
        {d.phone && <div className="card p-4"><dt className="text-muted">Phone</dt><dd className="mt-1 font-semibold"><a className="underline" href={`tel:${d.phone}`}>{formatNgPhone(d.phone)}</a></dd></div>}
      </dl>
      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">Shop with {d.name}</h2>
        <p className="mt-1 text-muted">
          {d.zones.length ? `Delivers to ${d.zones.map((z) => z.name).join(", ")}` : "Pickup only for now"}{d.pickup && d.zones.length ? ", or collect free from the shop" : ""}.
          Choose your area to see their prices and stock.
        </p>
        <ShopHere storeId={d.id} zones={(d.zones.some((z) => z.id === d.home?.id) || !d.home || !d.pickup ? d.zones : [d.home, ...d.zones]).map((z) => ({ id: z.id, name: z.name }))} />
        {d.zones.length > 0 && <p className="mt-4 text-sm text-muted">
          Delivery details per area:{" "}
          {d.zones.map((z, i) => <span key={z.id}>{i ? ", " : ""}<Link href={`/delivery/${z.slug}`} className="underline">{z.name}</Link></span>)}
        </p>}
      </section>
    </div>
  );
}
