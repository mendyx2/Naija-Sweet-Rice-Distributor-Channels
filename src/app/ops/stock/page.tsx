import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireOps } from "@/lib/ops-auth";
import { withinBand } from "@/lib/network-rules";
import { defaultLowAt, stockLevel, type StockLevel } from "@/lib/stock-levels";
import { ActionForm } from "@/components/action-form";
import { OpsNav } from "../ops-nav";
import { saveLowStockLevels } from "./actions";

export default function StockPage({ searchParams }: PageProps<"/ops/stock">) {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Stock searchParams={searchParams} /></Suspense>;
}

const STYLE: Record<StockLevel | "NA", string> = {
  OUT: "bg-promo-soft text-danger font-bold",
  LOW: "bg-cta/30 text-brand-strong font-bold",
  OK: "bg-brand-soft text-brand-strong",
  NA: "text-muted",
};
const LABEL: Record<StockLevel, string> = { OUT: "Sold out", LOW: "Running low", OK: "OK" };

async function Stock({ searchParams }: Pick<PageProps<"/ops/stock">, "searchParams">) {
  await requireOps();
  const onlyProblems = (await searchParams).f === "problems";
  const [variants, stores] = await Promise.all([
    db.variant.findMany({ orderBy: { sizeKg: "desc" } }),
    db.distributor.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isHq: "desc" }, { name: "asc" }],
      include: { stock: true, prices: true, homeZone: { select: { name: true, state: true } } },
    }),
  ]);
  const lowAt = (v: (typeof variants)[number]) => v.lowStockAt ?? defaultLowAt(v.sizeKg);

  const rows = stores.map((d) => {
    const cells = variants.map((v) => {
      const s = d.stock.find((x) => x.variantId === v.id);
      const price = d.isHq ? v.retailPriceKobo : d.prices.find((p) => p.variantId === v.id)?.retailPriceKobo ?? null;
      const sells = v.active && price != null && (d.isHq || withinBand(price, v.minRetailKobo, v.maxRetailKobo));
      const free = Math.max((s?.onHand ?? 0) - (s?.held ?? 0), 0);
      return { v, sells, free, held: s?.held ?? 0, inTransit: s?.inTransit ?? 0, level: sells ? stockLevel(free, lowAt(v)) : null };
    });
    const worst: StockLevel = cells.some((c) => c.level === "OUT") ? "OUT" : cells.some((c) => c.level === "LOW") ? "LOW" : "OK";
    return { d, cells, worst };
  });
  const counts = { OUT: rows.filter((r) => r.worst === "OUT").length, LOW: rows.filter((r) => r.worst === "LOW").length };
  const shown = onlyProblems ? rows.filter((r) => r.worst !== "OK") : rows;

  return (
    <>
      <OpsNav current="stock" />
      <h1 className="font-display text-2xl font-bold">Stock tracker</h1>
      <p className="mt-1 text-sm text-muted">
        Bags each store has available to sell (on hand minus bags held for unpaid orders). HQ and the store are alerted once when a size
        runs low or sells out. Buyers never see these numbers.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-muted">Stores with a size sold out</p><p className="font-display text-3xl font-bold text-danger">{counts.OUT}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Stores running low</p><p className="font-display text-3xl font-bold text-brand-strong">{counts.LOW}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Stores tracked</p><p className="font-display text-3xl font-bold">{rows.length}</p></div>
      </div>

      <nav className="mt-6 flex gap-2 text-sm" aria-label="Filter">
        <Link href="/ops/stock" aria-current={!onlyProblems ? "page" : undefined} className={`rounded-full px-3 py-1.5 ${!onlyProblems ? "bg-brand text-white" : "border border-border"}`}>All stores</Link>
        <Link href="/ops/stock?f=problems" aria-current={onlyProblems ? "page" : undefined} className={`rounded-full px-3 py-1.5 ${onlyProblems ? "bg-brand text-white" : "border border-border"}`}>Low or sold out ({counts.OUT + counts.LOW})</Link>
      </nav>

      <div className="mt-3 overflow-x-auto card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="p-3">Store</th>
              {variants.map((v) => <th key={v.id} className="p-3 whitespace-nowrap">{v.sizeKg}kg <span className="font-normal">(low ≤ {lowAt(v)})</span></th>)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={variants.length + 1} className="p-4 text-muted">No store is low or sold out.</td></tr>}
            {shown.map(({ d, cells }) => (
              <tr key={d.id} className="border-t border-border align-top">
                <td className="p-3">
                  <Link href={`/ops/distributors/${d.id}`} className="font-semibold underline">{d.isHq ? "Naija Sweet Rice HQ" : d.name}</Link>
                  {d.homeZone && <span className="block text-xs text-muted">{d.homeZone.name}, {d.homeZone.state}</span>}
                </td>
                {cells.map((c) => (
                  <td key={c.v.id} className="p-2">
                    {c.level ? (
                      <span className={`block rounded-lg px-2 py-1.5 ${STYLE[c.level]}`} title={LABEL[c.level]}>
                        <span className="tabular-nums">{c.free}</span> <span className="text-xs font-normal">{LABEL[c.level]}</span>
                        {(c.held > 0 || c.inTransit > 0) && (
                          <span className="block text-[11px] font-normal">{c.held ? `${c.held} held` : ""}{c.held && c.inTransit ? " · " : ""}{c.inTransit ? `${c.inTransit} on the way` : ""}</span>
                        )}
                      </span>
                    ) : <span className={`block px-2 py-1.5 ${STYLE.NA}`}>Not sold</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">To send stock, open the store and use &ldquo;Dispatch from HQ&rdquo;. HQ&apos;s own stock is set under Prices &amp; stock.</p>

      <section className="mt-8 card p-5 max-w-xl">
        <h2 className="font-semibold text-lg">&ldquo;Running low&rdquo; levels</h2>
        <p className="mt-1 text-sm text-muted">A store is flagged, and HQ is alerted, when its available bags of a size fall to this number.</p>
        <ActionForm action={saveLowStockLevels} submit="Save levels" className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {variants.map((v) => (
              <label key={v.id} className="block"><span className="font-semibold">{v.sizeKg}kg</span>
                <input name={`low:${v.id}`} inputMode="numeric" defaultValue={lowAt(v)} aria-label={`${v.sizeKg}kg running-low level`} className="field" />
              </label>
            ))}
          </div>
        </ActionForm>
      </section>
    </>
  );
}
