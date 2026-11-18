"use client";

import { useRouter } from "next/navigation";
import { setStore, setZone } from "@/lib/zone-store";

/** Remembers the shopper's area (and optionally the store), then opens `href` (a store page, or the area's stores). */
export function ShopButton({ zoneId, storeId, href, children, className }: { zoneId: string; storeId?: string; href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setZone(zoneId);
        if (storeId) setStore(storeId);
        router.push(href);
      }}
    >
      {children}
    </button>
  );
}
