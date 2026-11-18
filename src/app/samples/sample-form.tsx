"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { formatNaira } from "@/lib/money";
import { ZoneSelect, type ZoneOption } from "@/components/zone-select";
import { StoreList } from "@/components/store-list";
import { getAreaStores, type StoreListing } from "@/app/stores/actions";
import { getSampleQuote, requestSample, type SampleState } from "./actions";
import { track } from "@/lib/analytics";

/** Free 1kg sample: choose your area, a store, then delivery (you pay the fee) or free pickup. */
export function SampleForm({ zones, sampleVariantId, defaults }: {
  zones: ZoneOption[];
  sampleVariantId: string;
  defaults: { name: string; phone: string };
}) {
  const [zoneId, setZoneId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [state, action, pending] = useActionState<SampleState, FormData>(requestSample, null);
  useEffect(() => {
    if (!state?.ok) return;
    track("generate_lead");
    window.location.assign(state.url);
  }, [state]);

  const [stores, setStores] = useState<{ zoneId: string; list: StoreListing[] } | null>(null);
  const [quote, setQuote] = useState<{ key: string; data: Awaited<ReturnType<typeof getSampleQuote>> } | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (!zoneId) return;
    startTransition(async () => {
      const r = await getAreaStores(zoneId, sampleVariantId);
      // Stores with a sample in stock first; pick the only one automatically.
      const list = (r?.stores ?? []).filter((s) => !!s.sizes.find((v) => v.variantId === sampleVariantId)?.available);
      setStores({ zoneId, list });
      setStoreId(list.length === 1 ? list[0].id : "");
    });
  }, [zoneId, sampleVariantId]);
  const areaStores = stores && stores.zoneId === zoneId ? stores.list : null;
  const store = areaStores?.find((s) => s.id === storeId) ?? null;
  const mode = store && fulfillment === "PICKUP" && !store.pickup ? "DELIVERY" : store && fulfillment === "DELIVERY" && !store.delivery && store.pickup ? "PICKUP" : fulfillment;
  const key = `${zoneId}|${store?.id ?? ""}|${mode}`;
  useEffect(() => {
    if (!zoneId || !store) return;
    startTransition(async () => setQuote({ key, data: await getSampleQuote(zoneId, store.id, mode) }));
  }, [key, zoneId, store, mode]);
  const q = quote && quote.key === key ? quote.data : undefined;
  const ok = q && "feeKobo" in q ? q : null;
  const isPickup = mode === "PICKUP";

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="storeId" value={store?.id ?? ""} />
      <input type="hidden" name="fulfillment" value={mode} />
      <label className="block">
        <span className="text-sm font-semibold">Full name</span>
        <input name="name" required defaultValue={defaults.name} autoComplete="name" className="field" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Phone</span>
        <input name="phone" type="tel" required defaultValue={defaults.phone} autoComplete="tel-national" className="field" />
      </label>
      <div>
        <label htmlFor="zone" className="text-sm font-semibold">Your area</label>
        <ZoneSelect zones={zones} value={zoneId} onChange={setZoneId} name="zoneId" required />
      </div>
      {zoneId && areaStores && (
        areaStores.length
          ? <StoreList stores={areaStores} selectedId={store?.id ?? ""} onSelect={setStoreId} variantId={sampleVariantId} hidePrice label="Get it from" />
          : <p className="rounded-xl bg-promo-soft p-3 text-sm">No store near you has free samples right now. Please check back soon.</p>
      )}
      {store && (
        <fieldset>
          <legend className="text-sm font-semibold">Delivery or pickup</legend>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery or pickup">
            {(["DELIVERY", "PICKUP"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={mode === f} disabled={f === "DELIVERY" ? !store.delivery : !store.pickup}
                onClick={() => setFulfillment(f)}
                className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold disabled:opacity-40 ${mode === f ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface"}`}>
                {f === "DELIVERY" ? "Delivery" : "Pickup (free)"}
              </button>
            ))}
          </div>
          {isPickup && store.address && <p className="mt-2 text-xs text-muted">Collect from {store.name}, {store.address}{store.hours ? ` (${store.hours})` : ""}.</p>}
        </fieldset>
      )}
      {store && !isPickup && (
        <>
          <label className="block">
            <span className="text-sm font-semibold">Street address</span>
            <textarea name="street" rows={2} required autoComplete="street-address" className="field" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Nearest landmark</span>
            <input name="landmark" className="field" />
          </label>
        </>
      )}
      {store && q !== undefined && (
        ok ? (
          <div className="rounded-xl bg-background p-4">
            <div className="flex justify-between">
              <span>1kg sample <span className="text-muted">(free)</span> + {isPickup ? "pickup" : "delivery"}</span>
              <strong>{ok.feeKobo === 0 ? "Free" : formatNaira(ok.feeKobo)}</strong>
            </div>
            <p className="mt-1 text-xs text-muted">From {ok.seller}</p>
          </div>
        ) : <p className="rounded-xl bg-promo-soft p-3 text-sm">{q && "error" in q ? q.error : "Free samples aren't available here right now."}</p>
      )}
      {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending || state?.ok === true || !store || !ok} className="btn-cta w-full">
        {pending ? "Requesting…" : !ok ? "Request free sample" : ok.feeKobo === 0 ? "Get my free sample" : `Pay ${formatNaira(ok.feeKobo)} delivery`}
      </button>
    </form>
  );
}
