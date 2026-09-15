import { describe, expect, it } from "vitest";
import {
  getActiveProductVariants,
  getProductOptions,
  getProductPriceSummary,
  getSizesForColor,
  getVariantForSelection
} from "./product-view";
import { CatalogProduct } from "./types";

const product: CatalogProduct = {
  id: "101",
  syncProductId: 101,
  name: "Test Shirt",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [
    {
      syncVariantId: 201,
      variantId: 301,
      name: "Black / S",
      color: "Black",
      size: "S",
      retailPrice: "32.00",
      currency: "usd"
    },
    {
      syncVariantId: 202,
      variantId: 302,
      name: "Black / M",
      color: "Black",
      size: "M",
      retailPrice: "34.00",
      currency: "usd"
    },
    {
      syncVariantId: 203,
      variantId: 303,
      name: "Blue / S",
      color: "Blue",
      size: "S",
      retailPrice: "32.00",
      currency: "usd",
      availabilityStatus: "out_of_stock"
    },
    {
      syncVariantId: 204,
      variantId: 304,
      name: "Blue / L",
      color: "Blue",
      size: "L",
      retailPrice: "36.00",
      currency: "usd",
      isIgnored: true
    },
    {
      syncVariantId: 205,
      variantId: 305,
      name: "Blue / L",
      color: "Blue",
      size: "L",
      retailPrice: "36.00",
      currency: "usd"
    }
  ]
};

describe("product view helpers", () => {
  it("filters variants that are ignored, out of stock or discontinued", () => {
    expect(getActiveProductVariants(product).map((variant) => variant.syncVariantId)).toEqual([201, 202, 205]);
  });

  it("builds color and size options from active variants only", () => {
    expect(getProductOptions(product)).toEqual({
      colors: ["Black", "Blue"],
      sizes: ["S", "M", "L"]
    });
  });

  it("returns only sizes available for the selected color", () => {
    expect(getSizesForColor(product, "Black")).toEqual(["S", "M"]);
    expect(getSizesForColor(product, "Blue")).toEqual(["L"]);
  });

  it("summarizes a single-currency product price range from active variants", () => {
    expect(getProductPriceSummary(product)).toEqual({
      min: "32.00",
      max: "36.00",
      currency: "usd",
      isRange: true
    });
  });

  it("selects the matching active variant by color and size", () => {
    expect(getVariantForSelection(product, { color: "Black", size: "M" })?.syncVariantId).toBe(202);
    expect(getVariantForSelection(product, { color: "Blue", size: "S" })).toBeUndefined();
    expect(getVariantForSelection(product, { color: "Blue", size: "L" })?.syncVariantId).toBe(205);
  });
});
