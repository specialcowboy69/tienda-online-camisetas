import type { CatalogProduct } from "./types";
import { canonicalUrl } from "./seo";
import { getProductSlug } from "./product-slugs";

export type JsonLdObject = Record<string, unknown>;

export function organizationJsonLd(): JsonLdObject {
  const url = canonicalUrl("/");
  return { "@context": "https://schema.org", "@type": "Organization", "@id": `${url}#organization`, name: "No Context Club", url };
}

export function breadcrumbJsonLd(product: CatalogProduct): JsonLdObject {
  const slug = getProductSlug(product);
  if (!slug) throw new Error("Missing public product slug");
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shop all", item: canonicalUrl("/products") },
      { "@type": "ListItem", position: 2, name: product.name, item: canonicalUrl(`/products/${slug}`) }
    ]
  };
}

export function serializeJsonLd(value: JsonLdObject): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
