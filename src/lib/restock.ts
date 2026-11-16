import "server-only";
import { HQ_ID, type Tx } from "./network";
import { moveStock } from "./stock";

export type RestockLine = { variantId: string; sizeKg: number; qty: number; unitCostKobo?: number };

export class RestockError extends Error {}

/**
 * Stock delivered by HQ. Distributors order and pay for stock outside the platform;
 * HQ records each delivery here and the distributor confirms what arrived.
 * (Older restock requests made in the platform are kept for the record.)
 */

/** Moves bags from HQ's shelf into a distributor's "in transit" until they confirm receipt. */
export async function dispatchBags(tx: Tx, distributorId: string, distributorName: string, lines: { variantId: string; sizeKg: number; qty: number }[], actor: string, reference?: string) {
  for (const l of lines.filter((x) => x.qty > 0)) {
    const hq = await tx.distributorStock.findUnique({ where: { distributorId_variantId: { distributorId: HQ_ID, variantId: l.variantId } } });
    const free = (hq?.onHand ?? 0) - (hq?.held ?? 0);
    if (free < l.qty) throw new RestockError(`HQ only has ${free} × ${l.sizeKg}kg free to send.`);
    await moveStock(tx, { distributorId: HQ_ID, variantId: l.variantId, delta: -l.qty, type: "RESTOCK_SENT", actor, reference, note: `Sent to ${distributorName}` });
    await moveStock(tx, { distributorId, variantId: l.variantId, transitDelta: l.qty, type: "RESTOCK_SENT", actor, reference, note: "From HQ, awaiting receipt" });
  }
}

/** Called when a distributor confirms a delivery: dispatched restocks are now received. */
export async function markRestocksReceived(tx: Tx, distributorId: string) {
  await tx.restockOrder.updateMany({ where: { distributorId, status: "DISPATCHED" }, data: { status: "RECEIVED", receivedAt: new Date() } });
}
