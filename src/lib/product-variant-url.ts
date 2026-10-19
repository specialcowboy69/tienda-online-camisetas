import { getActiveProductVariants, getVariantForSelection } from "./product-view";
import { getProductSlug } from "./product-slugs";
import { canonicalUrl } from "./seo";
import type { CatalogProduct, CatalogVariant } from "./types";

export function selectUrlVariant(product: CatalogProduct, value: string | string[] | undefined): CatalogVariant | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  if (!Number.isSafeInteger(id)) return undefined;
  const active = getActiveProductVariants(product);
  const matches = active.filter(variant => variant.syncVariantId === id);
  if (matches.length !== 1) return undefined;
  const candidate = matches[0];
  if (active.filter(variant => variant.color === candidate.color && variant.size === candidate.size).length !== 1) return undefined;
  const first = active[0];
  const color = candidate.color || first.color || "";
  const size = candidate.size || first.size || "";
  if ((getVariantForSelection(product, { color, size }) || first) !== candidate) return undefined;
  return candidate;
}

export function variantUrl(product: CatalogProduct, variant: CatalogVariant): string {
  const slug = getProductSlug(product);
  const selected = selectUrlVariant(product, String(variant.syncVariantId));
  if (!slug || selected !== variant) throw new Error("Variant is not uniquely selectable");
  return `${canonicalUrl(`/products/${slug}`)}?variant=${variant.syncVariantId}`;
}
