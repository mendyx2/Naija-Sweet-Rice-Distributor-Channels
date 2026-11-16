"use client";

import { formatNaira } from "@/lib/money";
import type { StoreListing } from "@/app/stores/actions";

/**
 * The stores a customer can buy from in their area. Each shows its price for the
 * chosen bag size (or all sizes), stock, delivery fee and pickup address.
 */
export function StoreList({
  stores,
  selectedId,
  onSelect,
  variantId,
  label = "Choose a store",
  hidePrice = false,
}: {
  stores: StoreListing[];
  selectedId: string;
  onSelect: (id: string) => void;
  variantId?: string;
  label?: string;
  hidePrice?: boolean;
}) {
  if (!stores.length) {
    return <p className="rounded-xl bg-promo-soft p-3 text-sm">No store serves this area yet. Try a nearby area, or order on WhatsApp.</p>;
  }
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-2 space-y-2" role="radiogroup" aria-label={label}>
        {stores.map((s) => {
          const size = variantId ? s.sizes.find((v) => v.variantId === variantId) : null;
          const active = s.id === selectedId;
          const soldOut = size ? size.priceKobo == null || size.available === 0 : false;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(s.id)}
              className={`w-full rounded-xl border-2 p-3 text-left text-sm transition-colors ${active ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand/50"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{s.name}</span>
                  {s.address && <span className="block text-xs text-muted">{s.address}</span>}
                </span>
                {size && (
                  <span className="shrink-0 text-right">
                    {size.priceKobo != null && !hidePrice ? <span className="block font-bold tabular-nums text-foreground">{formatNaira(size.priceKobo)}</span> : null}
                    <span className={`block text-xs ${soldOut ? "text-danger" : "text-success"}`}>
                      {size.priceKobo == null ? "Not sold here" : size.available === 0 ? "Sold out" : size.available <= 10 ? `${size.available} left` : "In stock"}
                    </span>
                  </span>
                )}
              </span>
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                {s.delivery ? (
                  <span>Delivery {formatNaira(s.delivery.baseFeeKobo)}{s.delivery.perKgFeeKobo ? ` + ${formatNaira(s.delivery.perKgFeeKobo)}/kg` : ""}{s.delivery.etaHours ? `, ~${s.delivery.etaHours}h` : ""}{s.delivery.minOrderKg ? `, min ${s.delivery.minOrderKg}kg` : ""}</span>
                ) : <span>No delivery to this area</span>}
                {s.pickup && <span>Free pickup</span>}
                {s.joinsHqPromotions && <span>Accepts Naija Sweet Rice coupons</span>}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
