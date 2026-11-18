import Link from "next/link";
import { partnerSignOut } from "./login/actions";

const TABS = [
  { href: "/partner", label: "Orders", key: "orders" },
  { href: "/partner/stock", label: "Stock", key: "stock" },
  { href: "/partner/sales", label: "Shop sales", key: "sales" },
  { href: "/partner/reports", label: "My numbers", key: "reports" },
  { href: "/partner/alerts", label: "Alerts", key: "alerts" },
  { href: "/partner/settings", label: "Prices & delivery", key: "settings", owner: true },
  { href: "/partner/staff", label: "Staff", key: "staff", owner: true },
  { href: "/partner/profile", label: "Profile", key: "profile" },
] as const;

export function PartnerNav({ current, name, isOwner, status }: { current: (typeof TABS)[number]["key"]; name: string; isOwner: boolean; status?: string }) {
  return (
    <div className="mb-6">
      {status === "PENDING" && (
        <p role="status" className="mb-4 rounded-xl bg-cta/30 p-3 text-sm">
          <strong>Your store is waiting for HQ approval.</strong> Customers can&apos;t see it yet. Meanwhile, set your prices, delivery areas and fees under
          {" "}<Link href="/partner/settings" className="underline">Prices &amp; delivery</Link>. HQ will email you when it&apos;s approved and will add your opening stock.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Partner portal · <strong className="text-foreground">{name}</strong></p>
        <form action={partnerSignOut}><button className="text-sm text-muted underline">Sign out</button></form>
      </div>
      <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Partner">
        {TABS.filter((t) => !("owner" in t) || isOwner).map((t) => (
          <Link key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 ${current === t.key ? "bg-brand text-white" : "hover:bg-brand-soft"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
