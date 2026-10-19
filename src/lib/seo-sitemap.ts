import { getProductSlug } from "./product-slugs";
import { canonicalUrl } from "./seo";
import { filterPublicProducts } from "./storefront-publication";
import type { CatalogProduct } from "./types";

export function getSitemapUrls(products: CatalogProduct[]): string[] {
  const productUrls = filterPublicProducts(products).map(product => canonicalUrl("/products/" + getProductSlug(product)));
  return ["/", "/products", "/privacy", "/cookies"].map(canonicalUrl).concat([...new Set(productUrls)].sort());
}

export function serializeSitemap(urls: string[]): string {
  const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url => "  <url><loc>" + escapeXml(url) + "</loc></url>").join("\n") + "\n</urlset>\n";
}
