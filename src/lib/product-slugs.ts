export type ProductSlugEntry = {
  productId: string;
  slug: string;
};

export const productSlugEntries = [
  { productId: "468682936", slug: "falling-apart-cat-graphic-tee" },
  { productId: "468513582", slug: "farming-dog-aura-graphic-tee" },
  { productId: "468520575", slug: "sorry-i-cant-cat-graphic-tee" },
  { productId: "468502976", slug: "its-a-trap-cat-crop-top" },
  { productId: "468471370", slug: "momma-sorry-cat-cropped-hoodie" }
] as const satisfies ProductSlugEntry[];

export const productSlugsById = Object.fromEntries(productSlugEntries.map((entry) => [entry.productId, entry.slug])) as Record<string, string>;
export const productIdsBySlug = Object.fromEntries(productSlugEntries.map((entry) => [entry.slug, entry.productId])) as Record<string, string>;

export function getProductSlug(product: { id: string; name?: string }): string | undefined {
  return productSlugsById[product.id];
}

export function getProductIdBySlug(slug: string): string | undefined {
  return productIdsBySlug[slug];
}
