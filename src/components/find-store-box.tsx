"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setZone, useZone } from "@/lib/zone-store";
import { ZoneSelect, type ZoneOption } from "./zone-select";

/** "Find a store near you": state → area → the stores serving that area. */
export function FindStoreBox({ zones, dark = false, id = "find" }: { zones: ZoneOption[]; dark?: boolean; id?: string }) {
  const router = useRouter();
  const remembered = useZone();
  const [picked, setPicked] = useState("");
  const area = picked || (zones.some((z) => z.id === remembered) ? remembered : "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!area) return;
        setZone(area);
        router.push(`/stores?area=${encodeURIComponent(area)}`);
      }}
      className={`rounded-3xl p-4 sm:p-5 ${dark ? "bg-white text-foreground shadow-2xl" : "card"}`}
      aria-labelledby={`${id}-title`}
    >
      <p id={`${id}-title`} className="font-display text-xl font-bold">Find a store near you</p>
      <p className="text-sm text-muted">Choose your state and area. Every store sets its own prices.</p>
      <ZoneSelect id={`${id}-area`} zones={zones} value={area} onChange={setPicked} />
      <button disabled={!area} className="btn-cta mt-3 w-full text-lg">
        {area ? "Show stores" : "Choose your area"}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
