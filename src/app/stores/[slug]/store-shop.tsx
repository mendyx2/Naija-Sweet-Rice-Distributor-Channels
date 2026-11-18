"use client";

import Link from "next/link";
import { useState } from "react";
import { cart, useCart } from "@/lib/cart-store";
import { setStore, setZone, setFulfillment, useStoreChoice, useZone } from "@/lib/zone-store";
import { formatNaira } from "@/lib/money";
import { track, toItem } from "@/lib/analytics";
import { BagImage } from "@/components/bag-image";
import { CheckIcon, MinusIcon, PlusIcon } from "@/components/icons";
import type { ShopSize } from "@/lib/store-shop";

/**
 * The store's shelf: every bag size at this store's price. Buyers never see
 * stock levels: a size is either available or not, and an unavailable size
 * offers to order it from Naija Sweet Rice HQ instead.
 */
export function StoreShop({ store, sizes, areaIds, homeAreaId, pickup }: {
  store: { id: string; name: string; isHq: boolean };
  sizes: ShopSize[];
  areaIds: string[];
  homeAreaId: string | null;
  pickup: boolean;
}) {
  const lines = useCart();
  const currentStore = useStoreChoice();
  const zone = useZone();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState<string | null>(null);

  const add = (s: ShopSize) => {
    const n = qty[s.variantId] ?? 1;
    // One store per order: starting at a new store empties the cart (after asking).
    if (lines.length && currentStore && currentStore !== store.id) {
      if (!window.confirm(`Your cart has bags from another store. Start a new cart at ${store.name}?`)) return;
      cart.clear();
    }
    setStore(store.id);
    // Make sure the cart has an area this store serves, or switch to pickup.
    if (!areaIds.includes(zone) && pickup && zone && zone === homeAreaId) {
      setFulfillment("PICKUP"); // the buyer is in the shop's own area: collect from it
    } else if (!areaIds.includes(zone)) {
      const next = homeAreaId && areaIds.includes(homeAreaId) ? homeAreaId : areaIds[0] ?? homeAreaId;
      if (next) setZone(next);
      if (pickup && (!next || !areaIds.includes(next))) setFulfillment("PICKUP");
    }
    cart.add(s.variantId, n);
    track("add_to_cart", { valueKobo: (s.priceKobo ?? 0) * n, items: [toItem({ sku: s.variantId, sizeKg: s.sizeKg, priceKobo: s.priceKobo ?? 0, qty: n }, "Naija Sweet Rice")] });
    setAdded(`${n} × ${s.sizeKg}kg`);
  };

  return (
    <div>
      <ul className="grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {sizes.map((s) => {
          const n = qty[s.variantId] ?? 1;
          return (
            <li key={s.variantId} aria-label={`${s.sizeKg}kg bag`} className={`card flex flex-col p-3 ${s.available ? "tilt-card" : "opacity-95"}`}>
              <BagImage src={s.imageUrl} sizeKg={s.sizeKg} className="aspect-square bg-background" sizes="(min-width: 1024px) 260px, 45vw" />
              <div className="flex flex-1 flex-col px-1 pt-3">
                <p className="font-display text-2xl font-bold">{s.sizeKg}kg bag</p>
                {s.available ? (
                  <>
                    <p className="mt-1">
                      <span className="text-xl font-bold tabular-nums">{formatNaira(s.priceKobo!)}</span>
                      {s.compareAtKobo != null && s.compareAtKobo > s.priceKobo! && (
                        <span className="ml-2 text-sm text-muted line-through">{formatNaira(s.compareAtKobo)}</span>
                      )}
                      <span className="block text-xs text-muted">{formatNaira(Math.round(s.priceKobo! / s.sizeKg))}/kg</span>
                    </p>
                    <div className="mt-auto flex gap-2 pt-4">
                      <div className="flex items-center rounded-full border border-border" role="group" aria-label={`Quantity of ${s.sizeKg}kg`}>
                        <button type="button" aria-label="Decrease quantity" disabled={n <= 1}
                          onClick={() => setQty((q) => ({ ...q, [s.variantId]: Math.max(1, n - 1) }))}
                          className="flex h-10 w-9 items-center justify-center rounded-l-full hover:bg-brand-soft disabled:opacity-40"><MinusIcon /></button>
                        <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">{n}</span>
                        <button type="button" aria-label="Increase quantity" disabled={n >= 100}
                          onClick={() => setQty((q) => ({ ...q, [s.variantId]: Math.min(100, n + 1) }))}
                          className="flex h-10 w-9 items-center justify-center rounded-r-full hover:bg-brand-soft disabled:opacity-40"><PlusIcon /></button>
                      </div>
                      <button type="button" onClick={() => add(s)} className="btn-cta flex-1 px-3">Add to cart</button>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto pt-3">
                    <p className="text-sm font-semibold text-muted">Currently unavailable here</p>
                    {!store.isHq && s.hqAvailable && (
                      <Link href={`/stores/hq?size=${s.sizeKg}`} className="btn-outline mt-3 w-full py-2 text-sm">Order from Naija Sweet Rice HQ</Link>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {added && (
        <div role="status" className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand p-4 text-white shadow-xl">
          <span className="flex items-center gap-2 font-medium"><CheckIcon /> Added {added} from {store.name}</span>
          <Link href="/cart" className="btn-cta py-2">View cart &amp; checkout →</Link>
        </div>
      )}
    </div>
  );
}
