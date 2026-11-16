import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import QRCode from "qrcode";
import { db } from "./db";
import { TAGS } from "./catalogue";
import { site } from "./site";

/** Stores shown publicly: approved distributors that deliver to at least one area. */
export async function getPublicDistributors() {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.zones);
  const list = await db.distributor.findMany({
    where: { isHq: false, status: "ACTIVE", zoneFees: { some: { zone: { active: true } } } },
    orderBy: { name: "asc" },
    include: { zoneFees: { where: { zone: { active: true } }, include: { zone: { select: { id: true, slug: true, name: true, sortOrder: true } } } } },
  });
  return list.map((d) => ({
    id: d.id, slug: d.slug, name: d.name, address: d.address, hours: d.hours, phone: d.phone, pickup: d.pickupEnabled,
    zones: d.zoneFees.map((f) => f.zone).sort((a, b) => a.sortOrder - b.sortOrder).map(({ id, slug, name }) => ({ id, slug, name })),
  }));
}

export const shopLink = (slug: string) => `${site.url}/distributors/${slug}`;

/** Printable QR code (SVG) for a distributor's shop link, e.g. for their counter or delivery van. */
export async function shopQrSvg(slug: string): Promise<string> {
  return QRCode.toString(shopLink(slug), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#133821", light: "#ffffff" } });
}
