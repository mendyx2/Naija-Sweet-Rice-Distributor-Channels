import "server-only";
import type { DeliveryZone } from "@prisma/client";
import { db } from "./db";
import { isNigerianState } from "./states";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);

/** "  ikeja   GRA " → "Ikeja GRA". Letters, digits, spaces and . , ' - / & only. */
export function cleanAreaName(raw: string): string | null {
  const s = raw.replace(/[^\p{L}\p{N} .,'\-/&]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (s.length < 2) return null;
  return s.replace(/\b\p{Ll}/gu, (c, i: number) => (i === 0 || s[i - 1] === " " ? c.toUpperCase() : c));
}

/**
 * An area in a state, found by name (ignoring case) or created as a store area.
 * Store areas are only listed to customers once an approved store is there.
 */
export async function findOrCreateArea(rawName: string, state: string): Promise<DeliveryZone | null> {
  const name = cleanAreaName(rawName);
  if (!name || !isNigerianState(state)) return null;
  const existing = await db.deliveryZone.findFirst({ where: { state, name: { equals: name, mode: "insensitive" }, kind: { not: "PICKUP" } } });
  if (existing) return existing.active ? existing : null;
  const base = `${slugify(name) || "area"}-${slugify(state)}`;
  for (let i = 0; i < 5; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    try {
      return await db.deliveryZone.create({ data: { name, state, slug, kind: "AREA", sortOrder: 1000 } });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return null;
}
