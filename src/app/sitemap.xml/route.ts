import { getPublicCatalog } from "../../lib/public-catalog";
import { getSitemapUrls, serializeSitemap } from "../../lib/seo-sitemap";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const catalog = await getPublicCatalog();
  if (catalog.status === "unavailable") {
    return new Response("Sitemap temporarily unavailable.", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
  }
  return new Response(serializeSitemap(getSitemapUrls(catalog.products)), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}
