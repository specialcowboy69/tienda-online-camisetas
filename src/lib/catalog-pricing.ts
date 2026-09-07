import { normalizeCurrencyCode } from "./money";
import { CatalogProduct } from "./types";

export function applyStoreCurrencyToProducts(products: CatalogProduct[], storeCurrency?: string): CatalogProduct[] {
  const currency = normalizeOptionalCurrency(storeCurrency);
  if (!currency) {
    return products;
  }

  return products.map((product) => applyStoreCurrencyToProduct(product, currency));
}

export function applyStoreCurrencyToProduct(product: CatalogProduct, storeCurrency?: string): CatalogProduct {
  const currency = normalizeOptionalCurrency(storeCurrency);
  if (!currency) {
    return product;
  }

  return {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      currency
    }))
  };
}

function normalizeOptionalCurrency(currency?: string): string | undefined {
  return currency ? normalizeCurrencyCode(currency) : undefined;
}
