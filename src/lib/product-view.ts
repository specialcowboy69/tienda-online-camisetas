import { CatalogProduct, CatalogVariant } from "./types";

export type ProductOptions = {
  colors: string[];
  sizes: string[];
};

export type ProductPriceSummary = {
  min: string;
  max: string;
  currency: string;
  isRange: boolean;
};

function isVariantActive(variant: CatalogVariant): boolean {
  return !variant.isIgnored && variant.availabilityStatus !== "out_of_stock" && variant.availabilityStatus !== "discontinued";
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function getActiveProductVariants(product: CatalogProduct): CatalogVariant[] {
  return product.variants.filter(isVariantActive);
}

export function getProductOptions(product: CatalogProduct): ProductOptions {
  const activeVariants = getActiveProductVariants(product);

  return {
    colors: unique(activeVariants.map((variant) => variant.color)),
    sizes: unique(activeVariants.map((variant) => variant.size))
  };
}

export function getSizesForColor(product: CatalogProduct, color?: string): string[] {
  const activeVariants = getActiveProductVariants(product);
  const matchingVariants = color ? activeVariants.filter((variant) => variant.color === color) : activeVariants;
  return unique(matchingVariants.map((variant) => variant.size));
}

export function getProductPriceSummary(product: CatalogProduct): ProductPriceSummary | undefined {
  const activeVariants = getActiveProductVariants(product);
  if (!activeVariants.length) {
    return undefined;
  }

  const currency = activeVariants[0].currency;
  const prices = activeVariants.map((variant) => Number(variant.retailPrice)).filter((price) => Number.isFinite(price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return {
    min: min.toFixed(2),
    max: max.toFixed(2),
    currency,
    isRange: min !== max
  };
}

export function getVariantForSelection(product: CatalogProduct, selection: { color?: string; size?: string }): CatalogVariant | undefined {
  return getActiveProductVariants(product).find((variant) => {
    const colorMatches = selection.color ? variant.color === selection.color : true;
    const sizeMatches = selection.size ? variant.size === selection.size : true;
    return colorMatches && sizeMatches;
  });
}
