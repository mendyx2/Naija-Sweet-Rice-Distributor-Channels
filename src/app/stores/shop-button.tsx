"use client";

import { useRouter } from "next/navigation";
import { setStore, setZone } from "@/lib/zone-store";

/** Sets the shopper's area (and optionally the store), then opens the shop with their prices. */
export function ShopButton({ zoneId, storeId, children, className }: { zoneId: string; storeId?: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setZone(zoneId);
        if (storeId) setStore(storeId);
        router.push("/p/naija-sweet-rice");
      }}
    >
      {children}
    </button>
  );
}
