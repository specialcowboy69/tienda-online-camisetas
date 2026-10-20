import type { Metadata } from "next";
import { getCatalogProductImage } from "./catalog-images";
import { productSeoContentById } from "./product-seo-content";
import { getProductSlug } from "./product-slugs";
import type { CatalogProduct } from "./types";

export const SITE_ORIGIN = "https://www.funnyteesforall.com";

export function canonicalUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("Canonical path must be a local absolute path");
  }
  const url = new URL(path, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) throw new Error("Invalid canonical origin");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return SITE_ORIGIN + pathname;
}

export function pageMetadata(input: { path: string; title: string; description: string; image?: string }): Metadata {
  const title = input.title + " | No Context Club";
  const url = canonicalUrl(input.path);
  let image: string | undefined;
  if (input.image) {
    try {
      const candidate = new URL(input.image);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") image = input.image;
    } catch { /* Invalid provider images are omitted. */ }
  }
  return {
    title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "No Context Club", url, title, description: input.description, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description: input.description, ...(image ? { images: [image] } : {}) }
  };
}

export function productMetadata(product: CatalogProduct): Metadata {
  const content = productSeoContentById[product.id];
  const slug = getProductSlug(product);
  if (!content || !slug) throw new Error("Missing editorial product metadata");
  return pageMetadata({ ...content, path: "/products/" + slug, image: getCatalogProductImage(product) });
}
