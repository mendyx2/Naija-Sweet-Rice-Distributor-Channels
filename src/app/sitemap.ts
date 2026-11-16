import type { MetadataRoute } from "next";
import { getProducts, getZones } from "@/lib/catalogue";
import { getPublicDistributors } from "@/lib/distributors-public";
import { site } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, zones, distributors] = await Promise.all([getProducts(), getZones(), getPublicDistributors()]);
  const staticPages = ["", "/shop", "/promotions", "/delivery", "/samples", "/faq", "/track", "/returns-policy", "/privacy", "/terms"].map((path) => ({
    url: `${site.url}${path}`,
  }));
  return [
    ...staticPages,
    ...products.map((p) => ({ url: `${site.url}/p/${p.slug}`, lastModified: p.updatedAt })),
    ...zones.filter((z) => z.kind === "ABUJA" || z.kind === "NEARBY_TOWN").map((z) => ({ url: `${site.url}/delivery/${z.slug}` })),
    { url: `${site.url}/stores` },
    ...distributors.map((d) => ({ url: `${site.url}/distributors/${d.slug}` })),
  ];
}
