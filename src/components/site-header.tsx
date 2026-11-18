import Link from "next/link";
import { CartButton } from "./cart-button";
import { Logo } from "./logo";
import { UserIcon } from "./icons";
import { AreaPicker } from "./area-picker";
import { getShoppingAreas } from "@/lib/catalogue";

const nav = [
  { href: "/promotions", label: "Promotions" },
  { href: "/track", label: "Track order" },
  { href: "/partner/join", label: "Become a distributor" },
];

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export async function SiteHeader() {
  const zones = (await getShoppingAreas()).map((z) => ({ id: z.id, name: z.name, kind: z.kind, state: z.state }));
  return (
    <>
      <aside aria-label="Delivery notice" className="bg-brand-strong text-white/90 text-xs sm:text-sm text-center px-4 py-2">
        Delivery across Abuja &amp; nearby towns · <span className="text-cta font-semibold">Free pickup</span> from stores near you
      </aside>
      {/* Only the logo / account / cart row stays pinned, to leave room for content on phones. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link href="/stores" className="mr-2 inline-flex items-center gap-1.5 rounded-full bg-cta px-4 py-2 font-bold text-brand-strong shadow-sm hover:bg-cta-strong">
              <PinIcon /> Find a store
            </Link>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="px-3 py-2 rounded-full hover:bg-brand-soft">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <AreaPicker zones={zones} />
            <Link href="/account" aria-label="My account" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-brand-soft">
              <UserIcon className="h-6 w-6" />
            </Link>
            <CartButton />
          </div>
        </div>
      </header>
      {/* Mobile: nav row under the logo (scrolls away) */}
      <nav aria-label="Main mobile" className="md:hidden flex items-center justify-between gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-1.5 text-sm font-medium">
          <Link href="/stores" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cta px-3 py-1.5 font-bold text-brand-strong whitespace-nowrap">
            <PinIcon /> Find a store
          </Link>
          {nav.filter((n) => n.href !== "/promotions").map((n) => (
            <Link key={n.href} href={n.href} className="px-2.5 py-1.5 rounded-full hover:bg-brand-soft whitespace-nowrap">
              {n.label}
            </Link>
          ))}
      </nav>
    </>
  );
}
