import { describe, expect, it } from "vitest";
import { getProductIdBySlug, getProductSlug, productSlugEntries } from "./product-slugs";

describe("product slugs", () => {
  it("maps the planned public product slugs to stable Printful product IDs", () => {
    expect(getProductIdBySlug("falling-apart-cat-graphic-tee")).toBe("468682936");
    expect(getProductIdBySlug("farming-dog-aura-graphic-tee")).toBe("468513582");
    expect(getProductIdBySlug("sorry-i-cant-cat-graphic-tee")).toBe("468520575");
    expect(getProductIdBySlug("its-a-trap-cat-crop-top")).toBe("468502976");
    expect(getProductIdBySlug("momma-sorry-cat-cropped-hoodie")).toBe("468471370");
  });

  it("keeps slugs independent from editable Printful product names", () => {
    expect(getProductSlug({ id: "468682936", name: "A totally renamed product" })).toBe("falling-apart-cat-graphic-tee");
  });

  it("uses unique product IDs and unique slugs", () => {
    const ids = productSlugEntries.map((entry) => entry.productId);
    const slugs = productSlugEntries.map((entry) => entry.slug);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
