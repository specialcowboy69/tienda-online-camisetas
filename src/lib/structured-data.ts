import type { CatalogProduct } from "./types";
import { canonicalUrl } from "./seo";
import { getProductSlug } from "./product-slugs";
import { productContentById } from "./product-content";
import { productSeoContentById } from "./product-seo-content";
import { getActiveProductVariants } from "./product-view";
import { selectUrlVariant, variantUrl } from "./product-variant-url";

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

function exactUsdPrice(value: string): string | null {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const visiblePrice = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
  const exactDisplay = `$${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
  if (visiblePrice !== exactDisplay) return null;
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function httpImage(value?: string): value is string {
  if (!value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function productGroupJsonLd(product: CatalogProduct): JsonLdObject | null {
  const slug = getProductSlug(product);
  const content = productContentById[product.id];
  if (!slug || !content?.summary || !productSeoContentById[product.id] || !product.name.trim()) return null;

  const active = getActiveProductVariants(product);
  if (!active.length || active.some(variant => variant.currency?.toUpperCase() !== "USD")) return null;

  const url = canonicalUrl(`/products/${slug}`);
  const groupId = `${url}#product-group`;
  const variants = active.flatMap(variant => {
    const price = exactUsdPrice(variant.retailPrice);
    if (!price || !httpImage(variant.image) || !variant.name.trim()) return [];
    if (selectUrlVariant(product, String(variant.syncVariantId)) !== variant) return [];
    const selectedUrl = variantUrl(product, variant);
    return [{
      "@type": "Product",
      "@id": `${url}#variant-${variant.syncVariantId}`,
      sku: String(variant.syncVariantId),
      name: `${product.name} - ${variant.name}`,
      ...(variant.color ? { color: variant.color } : {}),
      ...(variant.size ? { size: variant.size } : {}),
      image: variant.image,
      url: selectedUrl,
      isVariantOf: { "@id": groupId },
      offers: { "@type": "Offer", url: selectedUrl, price, priceCurrency: "USD" }
    }];
  });
  if (!variants.length) return null;

  const variesBy = [
    ...(new Set(variants.map(variant => variant.color).filter(Boolean)).size > 1 ? ["https://schema.org/color"] : []),
    ...(new Set(variants.map(variant => variant.size).filter(Boolean)).size > 1 ? ["https://schema.org/size"] : [])
  ];
  return {
    "@context": "https://schema.org", "@type": "ProductGroup", "@id": groupId,
    productGroupID: product.id, url, name: product.name, description: content.summary,
    brand: { "@type": "Brand", name: "No Context Club" },
    ...(variesBy.length ? { variesBy } : {}), hasVariant: variants
  };
}

export function serializeJsonLd(value: JsonLdObject): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
