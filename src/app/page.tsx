import Link from "next/link";
import { getProducts, getShoppingAreas } from "@/lib/catalogue";
import { getStoreDirectory } from "@/lib/distributors-public";
import { Hero3D } from "@/components/hero-3d";
import { FindStoreBox } from "@/components/find-store-box";
import { ShareWhatsApp } from "@/components/share-whatsapp";
import { site } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { BagImage } from "@/components/bag-image";
import { GiftIcon, ShieldIcon, StoreIcon, TruckIcon } from "@/components/icons";

const benefits = [
  { Icon: StoreIcon, title: "Stores near you", text: "Authorised stores across Nigeria, each with its own prices" },
  { Icon: TruckIcon, title: "Delivery or free pickup", text: "Delivered by the store, or collect it yourself" },
  { Icon: ShieldIcon, title: "Bag replacement", text: "Damaged bag? We replace it within 48h of delivery" },
  { Icon: GiftIcon, title: "Purchase points", text: "Every ₦100 earns a point towards a discount" },
];

const steps = [
  { title: "Find a store", text: "Choose your state and area to see the authorised stores near you." },
  { title: "Pick your bags", text: "Each store shows its own prices for 50kg, 25kg, 5kg and 1kg bags." },
  { title: "Pay by transfer", text: "Pay straight into the store's bank account. Your bags are held for 3 hours." },
  { title: "Get your rice", text: "Delivered to your door, or collect it free. Your receipt arrives by email." },
];

const qualities = [
  { title: "Stone-free", text: "Cleaned and triple-sorted, so you don't pick through it before cooking." },
  { title: "Cooks soft and separate", text: "Parboiled for grains that stay apart, for jollof, fried rice or white rice." },
  { title: "Consistent, bag after bag", text: "The same quality whichever authorised store you buy from." },
  { title: "Bag replacement promise", text: "A torn or damaged bag? Report it within 48 hours of delivery and we replace it." },
];

const SIZE_NOTE: Record<number, string> = {
  50: "For big families and food businesses",
  25: "A month or more for most homes",
  5: "Everyday cooking",
  1: "Try it, or top up",
};

export default async function Home() {
  const [products, zones, directory] = await Promise.all([getProducts(), getShoppingAreas(), getStoreDirectory()]);
  const rice = products[0];
  const imageOf = (kg: number) => rice?.variants.find((v) => v.sizeKg === kg)?.imageUrl ?? site.productImage;
  const heroBags = [
    { src: imageOf(25), label: "25kg" },
    { src: imageOf(1), label: "1kg" },
    { src: imageOf(5), label: "5kg" },
  ];
  const stats = {
    stores: new Set(directory.flatMap((a) => a.stores.map((s) => s.id))).size,
    areas: directory.length,
    states: new Set(directory.map((a) => a.state)).size,
  };

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "GroceryStore",
          name: site.legalName,
          url: site.url,
          image: `${site.url}${site.productImage}`,
          telephone: site.phone || undefined,
          openingHours: site.hours,
          areaServed: ["Abuja", "Suleja", "Mararaba", "Nyanya", "Karu", "Kuje", "Bwari", "Madalla"],
          address: {
            "@type": "PostalAddress",
            streetAddress: site.street || undefined,
            addressLocality: site.area ? `${site.area}, ${site.city}` : site.city,
            addressRegion: site.region,
            addressCountry: site.country,
          },
          ...(site.lat && site.lng ? { geo: { "@type": "GeoCoordinates", latitude: site.lat, longitude: site.lng } } : {}),
        }}
      />

      {/* Hero: sell the rice, and put "find a store" front and centre */}
      <section className="relative overflow-hidden bg-brand-strong text-white">
        <div className="grain-overlay absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="absolute -left-40 top-1/3 h-[28rem] w-[28rem] rounded-full bg-brand/60 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-10 sm:pt-16 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
          <div>
            <p className="rise inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              <span className="h-2 w-2 rounded-full bg-cta" aria-hidden="true" /> Authorised stores across Nigeria
            </p>
            <h1 className="rise font-display text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-7xl font-bold mt-5" style={{ animationDelay: "80ms" }}>
              Sweet, stone&#8209;free rice<span className="block text-cta">from a store near you.</span>
            </h1>
            <p className="rise mt-5 max-w-lg text-lg text-white/85" style={{ animationDelay: "160ms" }}>
              Triple-sorted parboiled rice that cooks soft and separate, every time. Pick a store near you,
              pay by transfer and get it delivered, or collect it free.
            </p>
            <div className="rise mt-7 max-w-md" style={{ animationDelay: "240ms" }}>
              <FindStoreBox zones={zones} dark id="hero-find" />
            </div>
            <p className="rise mt-5 text-sm text-white/80" style={{ animationDelay: "320ms" }}>
              Sell Naija Sweet Rice?{" "}
              <Link href="/partner/join" className="font-semibold text-cta underline underline-offset-4">Become a distributor →</Link>
            </p>
          </div>
          <div className="rise" style={{ animationDelay: "200ms" }}>
            <Hero3D images={heroBags} />
          </div>
        </div>
        <div className="pattern-band" aria-hidden="true" />
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="how">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-promo">How it works</p>
        <h2 id="how" className="font-display text-3xl sm:text-4xl font-bold mt-2 max-w-xl">From the store to your pot in four steps</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="tilt-card card relative overflow-hidden p-6">
              <span className="font-display text-6xl font-bold text-brand/15" aria-hidden="true">{i + 1}</span>
              <h3 className="mt-1 font-semibold text-lg">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/stores" className="btn-cta text-lg px-8">Find a store <span aria-hidden="true">→</span></Link>
          {stats.stores > 0 && (
            <p className="self-center text-sm text-muted">
              <strong className="text-foreground">{stats.stores}</strong> store{stats.stores === 1 ? "" : "s"} in{" "}
              <strong className="text-foreground">{stats.areas}</strong> area{stats.areas === 1 ? "" : "s"} across{" "}
              <strong className="text-foreground">{stats.states}</strong> state{stats.states === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </section>

      {/* Why this rice */}
      <section className="mx-auto max-w-6xl px-4 pt-16 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="relative">
          <div className="absolute -inset-4 -rotate-3 rounded-[2rem] bg-cta/40" aria-hidden="true" />
          <BagImage src="/images/sweet-rice-25kg.jpg" sizeKg={25} className="relative aspect-[4/5] shadow-xl" sizes="(min-width: 1024px) 420px, 90vw" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-promo">Why families choose it</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2">Rice you don&apos;t have to pick through</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2">
            {qualities.map((q) => (
              <li key={q.title} className="border-l-4 border-cta pl-4">
                <h3 className="font-semibold">{q.title}</h3>
                <p className="mt-1 text-sm text-muted">{q.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sizes */}
      {rice && (
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="sizes">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="sizes" className="font-display text-3xl sm:text-4xl font-bold">Four bag sizes</h2>
              <p className="text-muted mt-1">From a 1kg try-out to a 50kg family or business bag. Each store sets its own prices.</p>
            </div>
            <Link href="/stores" className="font-semibold text-brand underline underline-offset-4">See prices at a store near you →</Link>
          </div>
          <ul className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
            {rice.variants.map((v) => (
              <li key={v.id}>
                <Link href="/stores" className="tilt-card card group block p-3">
                  <BagImage src={v.imageUrl} className="aspect-square bg-background" sizes="(min-width: 1024px) 260px, 45vw" />
                  <div className="px-2 pb-2 pt-3">
                    <p className="font-display text-2xl font-bold group-hover:text-brand">{v.sizeKg}kg</p>
                    <p className="mt-1 text-sm text-muted">{SIZE_NOTE[v.sizeKg] ?? "Find a store to see the price"}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Benefits */}
      <section aria-label="Why buy here" className="mx-auto max-w-6xl px-4 pt-16">
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6 rounded-3xl bg-brand-soft p-6 sm:p-8">
          {benefits.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand">
                <Icon />
              </span>
              <span>
                <span className="block font-semibold text-sm">{title}</span>
                <span className="block text-xs text-muted mt-0.5">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Become a distributor */}
      <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="distributors">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand-strong p-8 sm:p-12 text-white">
          <div className="grain-overlay absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cta/25 blur-2xl" aria-hidden="true" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cta">For distributors</p>
              <h2 id="distributors" className="font-display text-3xl sm:text-4xl font-bold mt-2">Sell Naija Sweet Rice from your own online store</h2>
              <p className="mt-3 text-white/85 max-w-xl">
                Register, set your prices, and get a ready-made store under your business name. Customers in your area find you,
                pay straight into your account, and you deliver or they collect.
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-white/90 sm:grid-cols-2">
                <li>✓ Your own store page and QR code</li>
                <li>✓ Your prices, your delivery fees</li>
                <li>✓ Payments straight to your bank</li>
                <li>✓ Orders, stock and sales in one portal</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/partner/join" className="btn-cta text-lg">Become a distributor</Link>
              <Link href="/partner/login" className="text-center text-sm font-semibold text-white/85 underline underline-offset-4">Already a distributor? Sign in</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sample, points, share */}
      <section className="mx-auto max-w-6xl px-4 py-16 grid gap-4 md:grid-cols-3">
        <div className="tilt-card rounded-3xl bg-promo-soft p-7">
          <span className="inline-block rounded-full bg-promo px-3 py-1 text-xs font-bold text-white">Try it first</span>
          <h2 className="font-display text-2xl font-bold mt-3">Free 1kg sample</h2>
          <p className="mt-2 text-sm text-foreground/80">Taste it before you buy a big bag. The rice is free; you only pay delivery, or collect it free.</p>
          <Link href="/samples" className="mt-5 btn-outline">Request a sample</Link>
        </div>
        <div className="tilt-card rounded-3xl bg-brand-soft p-7">
          <h2 className="font-display text-2xl font-bold text-brand">Shop more, save more</h2>
          <p className="mt-2 text-sm text-foreground/80">Earn a point for every ₦100. Turn 500 points into a ₦2,000 coupon, and earn faster when friends buy.</p>
          <Link href="/promotions" className="mt-5 btn-primary">How points work</Link>
        </div>
        <div className="tilt-card rounded-3xl border border-border bg-surface p-7">
          <h2 className="font-display text-2xl font-bold">Tell a friend</h2>
          <p className="mt-2 text-sm text-foreground/80">Know someone who&apos;s tired of picking stones out of rice? Send them the link.</p>
          <ShareWhatsApp className="mt-5" text={`Try ${site.name}: sweet, stone-free rice from a store near you.`} url={site.url} />
        </div>
      </section>
    </>
  );
}
