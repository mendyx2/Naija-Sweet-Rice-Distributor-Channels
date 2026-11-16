"use client";

import { useState } from "react";
import { sortStates, stateLabel } from "@/lib/states";

export type ZoneOption = { id: string; name: string; kind: "PICKUP" | "ABUJA" | "NEARBY_TOWN" | "AREA"; state: string };

const KIND_LABEL: Record<ZoneOption["kind"], string> = {
  ABUJA: "Abuja",
  NEARBY_TOWN: "Towns near Abuja (minimum order applies)",
  AREA: "Areas",
  PICKUP: "Pickup",
};

/**
 * State, then area. Only areas with at least one store are passed in, so each
 * state lists exactly where customers can buy. The area <select> carries the
 * `id`/`name` used by forms.
 */
export function ZoneSelect({
  zones, value, onChange, name, id = "zone", required,
}: {
  zones: ZoneOption[]; value: string; onChange?: (v: string) => void; name?: string; id?: string; required?: boolean;
}) {
  const states = sortStates(zones.map((z) => z.state));
  const selected = zones.find((z) => z.id === value);
  const [pickedState, setPickedState] = useState("");
  const state = selected?.state ?? (pickedState || (states.includes("FCT") ? "FCT" : states[0] ?? ""));
  const inState = zones.filter((z) => z.state === state);
  const kinds = (["ABUJA", "NEARBY_TOWN", "AREA", "PICKUP"] as const).filter((k) => inState.some((z) => z.kind === k));

  return (
    <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <select
        aria-label="State"
        id={`${id}-state`}
        value={state}
        onChange={(e) => { setPickedState(e.target.value); if (selected && selected.state !== e.target.value) onChange?.(""); }}
        className="field mt-0"
      >
        {states.map((s) => <option key={s} value={s}>{stateLabel(s)}</option>)}
      </select>
      <select id={id} name={name} required={required} value={selected ? value : ""} onChange={(e) => onChange?.(e.target.value)} className="field mt-0" aria-label="Area">
        <option value="">Choose your area…</option>
        {kinds.length === 1
          ? inState.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)
          : kinds.map((k) => (
            <optgroup key={k} label={state === "FCT" || k === "NEARBY_TOWN" ? KIND_LABEL[k] : "Areas"}>
              {inState.filter((z) => z.kind === k).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </optgroup>
          ))}
      </select>
    </div>
  );
}
