import "server-only";
import { db } from "./db";
import { alertHq, notifyDistributor } from "./staff-alerts";
import { withinBand } from "./network-rules";
import { alertToSend, defaultLowAt, stockLevel } from "./stock-levels";
import { site } from "./site";

/**
 * Tells HQ (and the store) when a store runs low on, or out of, a bag size it
 * sells. Each alert is sent once and re-armed when the store is restocked.
 * Called after sales, holds, deliveries and by the housekeeping job. Never throws.
 */
export async function checkStockLevels(distributorIds?: string[]): Promise<number> {
  try {
    const rows = await db.distributorStock.findMany({
      where: { distributor: { status: "ACTIVE" }, ...(distributorIds ? { distributorId: { in: distributorIds } } : {}) },
      include: { variant: true, distributor: { include: { prices: true } } },
    });
    const messages = new Map<string, { name: string; isHq: boolean; lines: string[] }>();
    let sent = 0;
    for (const r of rows) {
      const d = r.distributor;
      // Only sizes the store actually sells online count.
      const price = d.isHq ? r.variant.retailPriceKobo : d.prices.find((p) => p.variantId === r.variantId)?.retailPriceKobo ?? null;
      const sells = r.variant.active && price != null && (d.isHq || withinBand(price, r.variant.minRetailKobo, r.variant.maxRetailKobo));
      if (!sells) continue;
      const lowAt = r.variant.lowStockAt ?? defaultLowAt(r.variant.sizeKg);
      const free = Math.max(r.onHand - r.held, 0);
      const action = alertToSend(stockLevel(free, lowAt), { low: !!r.lowAlertAt, out: !!r.outAlertAt });
      if (!action) continue;
      const now = new Date();
      if (action === "CLEAR") {
        await db.distributorStock.update({ where: { distributorId_variantId: { distributorId: r.distributorId, variantId: r.variantId } }, data: { lowAlertAt: null, outAlertAt: null } });
        continue;
      }
      await db.distributorStock.update({
        where: { distributorId_variantId: { distributorId: r.distributorId, variantId: r.variantId } },
        data: action === "OUT" ? { outAlertAt: now, lowAlertAt: r.lowAlertAt ?? now } : { lowAlertAt: now },
      });
      const m = messages.get(d.id) ?? { name: d.isHq ? "HQ" : d.name, isHq: d.isHq, lines: [] };
      m.lines.push(action === "OUT" ? `${r.variant.sizeKg}kg: SOLD OUT` : `${r.variant.sizeKg}kg: running low (${free} left)`);
      messages.set(d.id, m);
      sent++;
    }
    for (const [id, m] of messages) {
      const text = `Stock alert for ${m.name}: ${m.lines.join("; ")}.`;
      await alertHq(`${text} See ${site.url}/ops/stock`, `Stock alert: ${m.name}`);
      if (!m.isHq) await notifyDistributor(id, "Stock running low", `${text} Order more from HQ; your stock: ${site.url}/partner/stock`);
    }
    return sent;
  } catch (e) {
    console.error("[stock-alerts]", e);
    return 0;
  }
}
