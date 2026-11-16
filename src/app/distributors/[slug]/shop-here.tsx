"use client";

import { useRouter } from "next/navigation";
import { setStore, setZone } from "@/lib/zone-store";

/** Picking an area here sets the shopper's area and chooses this store, so the shop shows its prices. */
export function ShopHere({ storeId, zones }: { storeId: string; zones: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {zones.map((z) => (
        <li key={z.id}>
          <button type="button" onClick={() => { setZone(z.id); setStore(storeId); router.push("/shop"); }}
            className="rounded-full border-2 border-brand px-4 py-2 font-semibold text-brand hover:bg-brand-soft">
            Shop in {z.name} →
          </button>
        </li>
      ))}
    </ul>
  );
}
