import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireOps } from "@/lib/ops-auth";
import { formatNaira } from "@/lib/money";
import { COVERAGE_STEPS, HQ_COLOUR, coverageStep, MAP_HEIGHT, MAP_WIDTH, ZONE_POSITIONS, dotRadius } from "@/lib/network-map";
import { OpsNav } from "../ops-nav";

export default function NetworkPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Network /></Suspense>;
}

const DAYS = 30;
const windowStart = () => new Date(Date.now() - DAYS * 86_400_000);

async function Network() {
  await requireOps();
  const since = windowStart();
  const [zones, distributors, sales] = await Promise.all([
    db.deliveryZone.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true, kind: true, distributorFees: { where: { distributor: { status: "ACTIVE" } }, select: { distributorId: true } } } }),
    db.distributor.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, isHq: true, status: true, _count: { select: { zoneFees: true } }, stock: { select: { onHand: true, variant: { select: { sizeKg: true } } } } },
    }),
    db.order.groupBy({
      by: ["zoneId", "distributorId"],
      where: { createdAt: { gte: since }, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } },
      _count: true,
      _sum: { totalKobo: true },
    }),
  ]);

  const byId = new Map(distributors.map((d) => [d.id, d]));
  const ordersInZone = new Map<string, number>();
  const perSeller = new Map<string, { orders: number; kobo: number }>();
  for (const s of sales) {
    ordersInZone.set(s.zoneId, (ordersInZone.get(s.zoneId) ?? 0) + s._count);
    const p = perSeller.get(s.distributorId ?? "hq") ?? { orders: 0, kobo: 0 };
    perSeller.set(s.distributorId ?? "hq", { orders: p.orders + s._count, kobo: p.kobo + (s._sum.totalKobo ?? 0) });
  }
  const storesIn = (z: (typeof zones)[number]) => z.distributorFees.map((f) => byId.get(f.distributorId)?.name ?? "?");
  const placed = zones.filter((z) => ZONE_POSITIONS[z.slug]);
  const hqAreas = zones.filter((z) => z.kind !== "PICKUP").length;

  return (
    <>
      <OpsNav current="network" />
      <h1 className="font-display text-2xl font-bold">Network map</h1>
      <p className="text-sm text-muted mt-1">
        How many stores deliver to each area besides HQ (darker = more), and paid orders there in the last {DAYS} days
        (bigger dot = more orders). HQ delivers to every area. Positions are approximate.
      </p>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Key">
        {COVERAGE_STEPS.map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            <span aria-hidden className="inline-block size-3 rounded-full border-2" style={{ background: c.fill ?? "#ffffff", borderColor: c.fill ?? HQ_COLOUR }} />
            {c.label}
          </li>
        ))}
      </ul>

      <figure className="mt-4 rounded-2xl border border-border bg-surface overflow-x-auto">
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="w-full min-w-[560px] h-auto" role="group"
          aria-label="Schematic map of Abuja delivery areas shaded by how many stores deliver there. The same information is in the table below.">
          <text x={MAP_WIDTH - 20} y={40} textAnchor="end" fontSize={18} fill="#6b6b66">N ↑</text>
          {placed.map((z) => {
            const { x, y } = ZONE_POSITIONS[z.slug];
            const n = ordersInZone.get(z.id) ?? 0;
            const r = dotRadius(n);
            const names = storesIn(z);
            const step = coverageStep(names.length);
            const c = step.fill;
            const label = `${z.name}: ${names.length ? `${names.join(", ")} and HQ` : "HQ only"}, ${n} order${n === 1 ? "" : "s"} in ${DAYS} days${z.kind === "NEARBY_TOWN" ? " (minimum order applies)" : ""}`;
            const dot = (
              <g className="group">
                <title>{label}</title>
                {/* Invisible larger target so small dots are easy to hover or tap */}
                <circle cx={x} cy={y} r={Math.max(r, 22)} fill="transparent" />
                <circle cx={x} cy={y} r={r} fill={c ?? "#ffffff"} stroke={c ? "#ffffff" : HQ_COLOUR} strokeWidth={c ? 2 : 2.5}
                  strokeDasharray={z.kind === "NEARBY_TOWN" ? "5 3" : undefined}
                  className="transition-[stroke-width] group-hover:[stroke-width:4]" />
                {n > 0 && <text x={x} y={y + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill={step.ink}>{n}</text>}
                <text x={x} y={y + r + 20} textAnchor="middle" fontSize={18} fill="#33332f">{z.name}</text>
              </g>
            );
            return <a key={z.id} href={`#area-${z.slug}`}>{dot}</a>;
          })}
        </svg>
        <figcaption className="px-4 pb-3 text-xs text-muted"><span className="sm:hidden">Swipe sideways to see the whole map. </span>Dashed outline = nearby town with a minimum order. Tap an area to see its stores in the table.</figcaption>
      </figure>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 items-start">
        <section>
          <h2 className="font-semibold">Sellers, last {DAYS} days</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-muted [&_th]:font-normal [&_th]:pr-3"><tr><th className="py-1">Seller</th><th>Areas</th><th>Orders</th><th>Sales</th></tr></thead>
            <tbody>
              {distributors.map((d) => {
                const s = perSeller.get(d.id) ?? { orders: 0, kobo: 0 };
                const areas = d.isHq ? hqAreas : d._count.zoneFees;
                const stock = [...d.stock].sort((a, b) => b.variant.sizeKg - a.variant.sizeKg).map((x) => `${x.variant.sizeKg}kg ${x.onHand}`).join(" · ");
                return [
                  <tr key={d.id} className="border-t border-border align-middle">
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-2">
                        {d.isHq ? "HQ" : <Link href={`/ops/distributors/${d.id}`} className="underline">{d.name}</Link>}
                        {d.status !== "ACTIVE" && <span className="text-xs text-muted">({d.status.toLowerCase()})</span>}
                      </span>
                    </td>
                    <td className="pr-3">{areas}</td><td className="pr-3">{s.orders}</td><td className="whitespace-nowrap">{formatNaira(s.kobo)}</td>
                  </tr>,
                  <tr key={`${d.id}-stock`}><td colSpan={4} className="pb-2 text-xs text-muted">In stock: {stock || "none"}</td></tr>,
                ];
              })}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="font-semibold">Areas</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-muted [&_th]:font-normal [&_th]:pr-3"><tr><th className="py-1">Area</th><th>Stores (besides HQ)</th><th>Orders</th></tr></thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} id={`area-${z.slug}`} className="border-t border-border target:bg-brand-soft">
                  <td className="py-1.5 pr-2">{z.name}{z.kind === "NEARBY_TOWN" && <span className="text-xs text-muted"> · min order</span>}{!ZONE_POSITIONS[z.slug] && z.kind !== "PICKUP" && <span className="text-xs text-muted"> · not on map</span>}</td>
                  <td className="pr-2">{storesIn(z).join(", ") || <span className="text-muted">none</span>}</td>
                  <td>{ordersInZone.get(z.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
