import type { MetadataRoute } from "next";
import { getZones } from "@/lib/catalogue";
import { getPublicDistributors } from "@/lib/distributors-public";
import { site } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [zones, distributors] = await Promise.all([getZones(), getPublicDistributors()]);
  const staticPages = ["", "/stores", "/promotions", "/delivery", "/samples", "/faq", "/track", "/returns-policy", "/privacy", "/terms"].map((path) => ({
    url: `${site.url}${path}`,
  }));
  return [
    ...staticPages,
    ...zones.filter((z) => z.kind === "ABUJA" || z.kind === "NEARBY_TOWN").map((z) => ({ url: `${site.url}/delivery/${z.slug}` })),
    { url: `${site.url}/stores/hq` },
    ...distributors.map((d) => ({ url: `${site.url}/stores/${d.slug}` })),
  ];
}
