import { describe, expect, it } from "vitest";
import { selectUrlVariant, variantUrl } from "./product-variant-url";
import type { CatalogProduct, CatalogVariant } from "./types";

const black: CatalogVariant = { syncVariantId: 11, variantId: 111, name: "Black / M", color: "Black", size: "M", retailPrice: "29", currency: "USD", image: "https://example.com/black.webp" };
const blue: CatalogVariant = { syncVariantId: 22, variantId: 222, name: "Blue / L", color: "Blue", size: "L", retailPrice: "31", currency: "USD", image: "https://example.com/blue.webp" };
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Falling apart", storefrontImage: "https://example.com/tee.webp", variants: [black, blue], updatedAt: "2026-10-19" };

describe("product variant URLs", () => {
  it("selects only the active variant with the exact sync ID", () => {
    expect(selectUrlVariant(product, "22")).toEqual(blue);
    expect(selectUrlVariant(product, "11")).toEqual(black);
    expect(variantUrl(product, blue)).toBe("https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee?variant=22");
  });

  it.each([undefined, ["22"], ["22", "11"], "", "0", "-22", "22.0", "2.2e1", " 22", "22 ", "+22", "022", "23", "9007199254740992"])(
    "rejects absent, repeated, malformed, foreign or unsafe ID %j",
    value => expect(selectUrlVariant(product, value)).toBeUndefined()
  );

  it.each(["out_of_stock", "discontinued"])("rejects %s variants", availabilityStatus => {
    expect(selectUrlVariant({ ...product, variants: [{ ...blue, availabilityStatus }] }, "22")).toBeUndefined();
  });

  it("rejects ignored variants, duplicate sync IDs and ambiguous color/size", () => {
    expect(selectUrlVariant({ ...product, variants: [{ ...blue, isIgnored: true }] }, "22")).toBeUndefined();
    expect(selectUrlVariant({ ...product, variants: [blue, { ...blue, name: "Second" }] }, "22")).toBeUndefined();
    expect(selectUrlVariant({ ...product, variants: [blue, { ...blue, syncVariantId: 33 }] }, "22")).toBeUndefined();
    expect(selectUrlVariant({ ...product, variants: [blue, { ...blue, syncVariantId: 33 }] }, "33")).toBeUndefined();
  });

  it("rejects unsafe catalog IDs even when requested text is decimal", () => {
    expect(selectUrlVariant({ ...product, variants: [{ ...blue, syncVariantId: Number.MAX_SAFE_INTEGER + 1 }] }, String(Number.MAX_SAFE_INTEGER + 1))).toBeUndefined();
  });

  it("rejects a missing size when the panel would choose a different variant", () => {
    const noSize = { ...blue, color: "Black", size: undefined };
    const mixed = { ...product, variants: [black, noSize] };
    expect(selectUrlVariant(mixed, "22")).toBeUndefined();
    expect(() => variantUrl(mixed, noSize)).toThrow("Variant is not uniquely selectable");
  });

  it("rejects a missing color when the panel would choose a different variant", () => {
    const noColor = { ...blue, color: undefined, size: "M" };
    const mixed = { ...product, variants: [black, noColor] };
    expect(selectUrlVariant(mixed, "22")).toBeUndefined();
    expect(() => variantUrl(mixed, noColor)).toThrow("Variant is not uniquely selectable");
  });

  it("can still select a uniquely resolvable first variant with one missing option", () => {
    const first = { ...black, size: undefined };
    expect(selectUrlVariant({ ...product, variants: [first, blue] }, "11")).toEqual(first);
  });

  it("rejects raw whitespace in a candidate's displayed color or size", () => {
    const paddedColor = { ...blue, color: " Blue " };
    const paddedSize = { ...blue, size: " L " };
    expect(selectUrlVariant({ ...product, variants: [black, paddedColor] }, "22")).toBeUndefined();
    expect(selectUrlVariant({ ...product, variants: [black, paddedSize] }, "22")).toBeUndefined();
    expect(() => variantUrl({ ...product, variants: [black, paddedColor] }, paddedColor)).toThrow("Variant is not uniquely selectable");
  });

  it("rejects a clean candidate when another active variant has the same displayed color and size", () => {
    const padded = { ...blue, syncVariantId: 33, color: " Blue ", size: " L " };
    const mixed = { ...product, variants: [black, blue, padded] };
    expect(selectUrlVariant(mixed, "22")).toBeUndefined();
    expect(selectUrlVariant(mixed, "33")).toBeUndefined();
    expect(() => variantUrl(mixed, blue)).toThrow("Variant is not uniquely selectable");
    expect(() => variantUrl(mixed, padded)).toThrow("Variant is not uniquely selectable");
  });
});
