"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireOps } from "@/lib/ops-auth";
import { checkStockLevels } from "@/lib/stock-alerts";

export type FormState = { ok: boolean; message: string } | null;

/** HQ sets the "running low" level per bag size (bags available at a store). */
export async function saveLowStockLevels(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireOps();
  const variants = await db.variant.findMany();
  for (const v of variants) {
    const raw = String(formData.get(`low:${v.id}`) ?? "").trim();
    if (raw === "") continue;
    if (!/^\d{1,5}$/.test(raw)) return { ok: false, message: `${v.sizeKg}kg: enter a whole number of bags.` };
    await db.variant.update({ where: { id: v.id }, data: { lowStockAt: Number(raw) } });
  }
  await db.auditLog.create({ data: { actor, action: "stock.low_levels", entity: "Variant", entityId: "all" } });
  await checkStockLevels();
  refresh();
  return { ok: true, message: "Saved. Stores at or below these levels are flagged, and HQ is alerted once per store and size." };
}
