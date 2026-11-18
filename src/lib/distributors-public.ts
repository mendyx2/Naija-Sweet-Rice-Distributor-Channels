import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import QRCode from "qrcode";
import { db } from "./db";
import { TAGS, getShoppingAreas } from "./catalogue";
import { site } from "./site";

/** Stores shown publicly: approved distributors that deliver to at least one area, or offer pickup at their shop. */
export async function getPublicDistributors() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.zones);
  const list = await db.distributor.findMany({
    where: { isHq: false, status: "ACTIVE", OR: [{ zoneFees: { some: { zone: { active: true } } } }, { pickupEnabled: true, homeZoneId: { not: null } }] },
    orderBy: { name: "asc" },
    include: { homeZone: { select: { id: true, slug: true, name: true } }, zoneFees: { where: { zone: { active: true } }, include: { zone: { select: { id: true, slug: true, name: true, sortOrder: true } } } } },
  });
  return list.map((d) => ({
    id: d.id, slug: d.slug, name: d.name, address: d.address, hours: d.hours, phone: d.phone, pickup: d.pickupEnabled, home: d.homeZone,
    zones: d.zoneFees.map((f) => f.zone).sort((a, b) => a.sortOrder - b.sortOrder).map(({ id, slug, name }) => ({ id, slug, name })),
  }));
}

export const shopLink = (slug: string) => `${site.url}/stores/${slug}`;

/** Printable QR code (SVG) for a distributor's shop link, e.g. for their counter or delivery van. */
export async function shopQrSvg(slug: string): Promise<string> {
  return QRCode.toString(shopLink(slug), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#133821", light: "#ffffff" } });
}

export type DirectoryStore = {
  id: string; slug: string; name: string; isHq: boolean; address: string | null; hours: string | null; phone: string | null;
  pickup: boolean; shopHere: boolean; deliversHere: boolean;
};
export type DirectoryArea = { id: string; slug: string; name: string; state: string; stores: DirectoryStore[] };

/**
 * Every area in Nigeria where customers can buy, with the stores there: HQ in
 * its own areas, stores that deliver to the area, and stores whose shop is in it.
 */
export async function getStoreDirectory(): Promise<DirectoryArea[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.zones);
  const [areas, stores] = await Promise.all([
    getShoppingAreas(),
    db.distributor.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, isHq: true, address: true, hours: true, phone: true, pickupEnabled: true, homeZoneId: true, zoneFees: { select: { zoneId: true } } },
    }),
  ]);
  const hqAddress = [site.street, site.area, "Abuja"].filter(Boolean).join(", ") || null;
  return areas.map((a) => ({
    id: a.id, slug: a.slug, name: a.name, state: a.state,
    stores: stores
      .map((d) => {
        const deliversHere = d.isHq ? a.kind === "ABUJA" || a.kind === "NEARBY_TOWN" : d.zoneFees.some((f) => f.zoneId === a.id);
        const shopHere = d.homeZoneId === a.id;
        return {
          id: d.id, slug: d.slug, name: d.isHq ? `${site.name} HQ` : d.name, isHq: d.isHq,
          address: d.address ?? (d.isHq ? hqAddress : null), hours: d.hours ?? (d.isHq ? site.hoursLabel : null), phone: d.phone,
          pickup: d.pickupEnabled, shopHere, deliversHere,
        };
      })
      .filter((d) => d.deliversHere || (d.shopHere && d.pickup))
      .sort((x, y) => Number(y.shopHere) - Number(x.shopHere) || Number(x.isHq) - Number(y.isHq) || x.name.localeCompare(y.name)),
  })).filter((a) => a.stores.length > 0);
}
