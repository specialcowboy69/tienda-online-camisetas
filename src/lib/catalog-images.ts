import { CatalogProduct, CatalogVariant } from "./types";

function nonEmptyImage(value?: string) {
  return value?.trim() || undefined;
}

export function getCatalogProductImage(product: CatalogProduct, variant?: CatalogVariant) {
  return (
    nonEmptyImage(product.storefrontImage) ||
    nonEmptyImage(product.storefrontImages?.[0]) ||
    nonEmptyImage(variant?.image) ||
    nonEmptyImage(product.thumbnail)
  );
}
