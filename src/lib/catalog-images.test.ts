import { describe, expect, it } from "vitest";
import { getCatalogProductImage } from "./catalog-images";
import { CatalogProduct, CatalogVariant } from "./types";

const variant: CatalogVariant = {
  syncVariantId: 201,
  variantId: 301,
  name: "Black / L",
  retailPrice: "25.50",
  currency: "eur",
  image: "https://example.com/printful-variant.webp"
};

const product: CatalogProduct = {
  id: "101",
  syncProductId: 101,
  name: "Test Shirt",
  thumbnail: "https://example.com/printful-thumbnail.webp",
  storefrontImage: "https://example.com/manual-storefront.webp",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [variant]
};

describe("catalog images", () => {
  it("uses the manual storefront image before Printful variant and thumbnail images", () => {
    expect(getCatalogProductImage(product, variant)).toBe("https://example.com/manual-storefront.webp");
  });

  it("falls back to Printful images when no manual storefront image exists", () => {
    expect(getCatalogProductImage({ ...product, storefrontImage: undefined, storefrontImages: undefined }, variant)).toBe(
      "https://example.com/printful-variant.webp"
    );
    expect(getCatalogProductImage({ ...product, storefrontImage: undefined, storefrontImages: undefined }, { ...variant, image: undefined })).toBe(
      "https://example.com/printful-thumbnail.webp"
    );
  });

  it("uses the first manual gallery image before Printful images", () => {
    expect(
      getCatalogProductImage(
        {
          ...product,
          storefrontImage: undefined,
          storefrontImages: ["https://example.com/manual-gallery-01.webp"]
        },
        variant
      )
    ).toBe("https://example.com/manual-gallery-01.webp");
  });
});
