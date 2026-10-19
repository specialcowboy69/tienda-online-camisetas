import { getCatalogProductImage } from "./catalog-images";
import { getCatalogProduct } from "./firestore";
import { productContentById } from "./product-content";
import { getProductIdBySlug, getProductSlug } from "./product-slugs";
import type { CatalogProduct } from "./types";

export function isPublicProduct(product: CatalogProduct): boolean {
  const slug = getProductSlug(product);
  if (product.isIgnored || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || productContentById[product.id]?.status !== "verified") return false;
  const image = getCatalogProductImage(product);
  if (!image) return false;
  try {
    const url = new URL(image);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function filterPublicProducts(products: CatalogProduct[]): CatalogProduct[] {
  return products.filter(isPublicProduct);
}

export async function getPublicProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const id = getProductIdBySlug(slug);
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const product = await getCatalogProduct(id);
  return product && isPublicProduct(product) ? product : null;
}
