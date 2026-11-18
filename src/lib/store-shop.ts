import "server-only";
import { db } from "./db";
import { offerFor, HQ_ID } from "./network";
import { site } from "./site";

export type ShopSize = {
  variantId: string;
  sizeKg: number;
  imageUrl: string | null;
  priceKobo: number | null;
  compareAtKobo: number | null;
  /** Can be bought here now. Buyers never see stock numbers, only this. */
  available: boolean;
  /** This size can be ordered from HQ instead (shown when it's unavailable here). */
  hqAvailable: boolean;
};

export type StoreShop = {
  id: string;
  slug: string;
  name: string;
  isHq: boolean;
  address: string | null;
  hours: string | null;
  phone: string | null;
  pickup: boolean;
  joinsHqPromotions: boolean;
  home: { id: string; name: string; state: string } | null;
  areas: { id: string; slug: string; name: string; state: string }[];
  sizes: ShopSize[];
};

/**
 * A store's own shop: its prices for each bag size and whether each is
 * available, plus where it delivers. Only approved stores (and HQ) have one.
 */
export async function getStoreShop(slug: string): Promise<StoreShop | null> {
  const d = await db.distributor.findUnique({
    where: { slug },
    include: {
      homeZone: { select: { id: true, name: true, state: true } },
      zoneFees: { where: { zone: { active: true } }, include: { zone: { select: { id: true, slug: true, name: true, state: true, sortOrder: true } } } },
    },
  });
  if (!d || d.status !== "ACTIVE") return null;
  const [{ offer }, { offer: hq }, variants, hqAreas] = await Promise.all([
    offerFor(d.id, null),
    d.isHq ? Promise.resolve({ offer: null }) : offerFor(HQ_ID, null),
    db.variant.findMany({ where: { active: true, product: { active: true } }, orderBy: { sizeKg: "desc" } }),
    d.isHq
      ? db.deliveryZone.findMany({ where: { active: true, kind: { in: ["ABUJA", "NEARBY_TOWN"] } }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true, state: true } })
      : Promise.resolve([]),
  ]);
  if (!offer?.ready) return null;
  const hqReady = !!hq?.ready;

  const sizes: ShopSize[] = variants.map((v) => {
    const o = offer.variants.find((x) => x.variantId === v.id);
    const h = hq?.variants.find((x) => x.variantId === v.id);
    const price = o?.retailPriceKobo ?? null;
    return {
      variantId: v.id,
      sizeKg: v.sizeKg,
      imageUrl: v.imageUrl,
      priceKobo: price,
      compareAtKobo: d.isHq ? v.compareAtPriceKobo : null,
      available: !!o?.active && price != null && o.available > 0,
      hqAvailable: hqReady && !!h?.active && h.retailPriceKobo != null && h.available > 0,
    };
  });

  const areas = d.isHq
    ? hqAreas
    : d.zoneFees.map((f) => f.zone).sort((a, b) => a.sortOrder - b.sortOrder).map(({ id, slug, name, state }) => ({ id, slug, name, state }));

  return {
    id: d.id,
    slug: d.slug,
    name: d.isHq ? `${site.name} HQ` : d.name,
    isHq: d.isHq,
    address: offer.address,
    hours: offer.hours,
    phone: d.phone ?? (d.isHq ? site.phone || null : null),
    pickup: offer.pickup,
    joinsHqPromotions: offer.joinsHqPromotions,
    home: d.homeZone,
    areas,
    sizes,
  };
}
