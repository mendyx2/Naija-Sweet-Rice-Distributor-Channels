"use client";

import { useState } from "react";
import { NIGERIAN_STATES, stateLabel } from "@/lib/states";

type Area = { id: string; name: string; kind: string; state: string };

/**
 * Where the store is: state, the area its shop is in (or a new one), and the
 * areas it delivers to in that state (ticked, or typed if they aren't listed yet).
 */
export function JoinAreas({ areas }: { areas: Area[] }) {
  const [state, setState] = useState("FCT");
  const [home, setHome] = useState("");
  const inState = areas.filter((a) => a.state === state);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="font-semibold">State</span>
        <select name="state" value={state} onChange={(e) => { setState(e.target.value); setHome(""); }} className="field">
          {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{stateLabel(s)}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="font-semibold">Area your shop is in</span>
        <select name="homeZoneId" required value={home} onChange={(e) => setHome(e.target.value)} className="field">
          <option value="" disabled>Choose…</option>
          {inState.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value="new">My area isn&apos;t listed: add it</option>
        </select>
      </label>
      {home === "new" && (
        <label className="block">
          <span className="font-semibold">Name of your area</span>
          <input name="newHomeArea" required maxLength={60} placeholder="e.g. Ikeja, Wuse Market, Sabon Gari" className="field" />
          <span className="text-xs text-muted">Use the name customers know it by. HQ may tidy the spelling.</span>
        </label>
      )}

      <div>
        <p className="font-semibold">Areas you deliver to in {stateLabel(state)}</p>
        <p className="text-muted">Customers there will see your store. Other stores may serve the same areas; customers choose.</p>
        {inState.length > 0 && (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {inState.map((z) => (
              <label key={z.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="zone" value={z.id} className="h-4 w-4 accent-[var(--brand)]" />
                <span>{z.name}{z.kind === "NEARBY_TOWN" && <span className="block text-xs text-muted">town, min. order</span>}</span>
              </label>
            ))}
          </div>
        )}
        <label className="mt-3 block">
          <span className="font-semibold">{inState.length ? "Other areas" : "Areas"} you deliver to <span className="font-normal text-muted">(comma-separated, optional)</span></span>
          <input name="newAreas" maxLength={400} placeholder="e.g. Ikeja, Ogba, Agege" className="field" />
          <span className="text-xs text-muted">Leave empty if you only offer pickup. Your shop&apos;s own area is included when you deliver.</span>
        </label>
      </div>
    </div>
  );
}
