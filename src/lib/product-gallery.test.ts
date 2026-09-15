import { describe, expect, it } from "vitest";
import { getCatalogProductGallery } from "./product-gallery";
import { CatalogProduct } from "./types";

const product: CatalogProduct = {
  id: "101",
  syncProductId: 101,
  name: "Test Shirt",
  storefrontImage: "https://example.com/main.webp",
  storefrontImages: ["https://example.com/main.webp", "https://example.com/editorial.webp", " "],
  thumbnail: "https://example.com/thumb.webp",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [
    {
      syncVariantId: 201,
      variantId: 301,
      name: "Black / M",
      color: "Black",
      size: "M",
      retailPrice: "32.00",
      currency: "usd",
      image: "https://example.com/black.webp"
    },
    {
      syncVariantId: 202,
      variantId: 302,
      name: "Black / L",
      color: "Black",
      size: "L",
      retailPrice: "32.00",
      currency: "usd",
      image: "https://example.com/black.webp"
    },
    {
      syncVariantId: 203,
      variantId: 303,
      name: "White / M",
      color: "White",
      size: "M",
      retailPrice: "32.00",
      currency: "usd",
      image: "https://example.com/white.webp",
      availabilityStatus: "out_of_stock"
    }
  ]
};

describe("product gallery", () => {
  it("builds a deduplicated editorial gallery from manual, variant and thumbnail images", () => {
    expect(getCatalogProductGallery(product)).toEqual([
      { src: "https://example.com/main.webp", alt: "Test Shirt product image 1" },
      { src: "https://example.com/editorial.webp", alt: "Test Shirt product image 2" },
      { src: "https://example.com/black.webp", alt: "Test Shirt product image 3" },
      { src: "https://example.com/thumb.webp", alt: "Test Shirt product image 4" }
    ]);
  });

  it("falls back to a single thumbnail image when no richer images exist", () => {
    expect(
      getCatalogProductGallery({
        ...product,
        storefrontImage: undefined,
        storefrontImages: undefined,
        variants: product.variants.map((variant) => ({ ...variant, image: undefined }))
      })
    ).toEqual([{ src: "https://example.com/thumb.webp", alt: "Test Shirt product image 1" }]);
  });
});
