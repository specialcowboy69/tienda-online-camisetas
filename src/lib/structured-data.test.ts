import { describe, expect, it } from "vitest";
import { organizationJsonLd, breadcrumbJsonLd, serializeJsonLd } from "./structured-data";
import type { CatalogProduct } from "./types";
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Falling apart", variants: [], updatedAt: "2026-10-19T00:00:00Z" };
describe("structured data", () => {
  it("describes only the verified brand identity", () => {
    expect(organizationJsonLd()).toEqual({ "@context": "https://schema.org", "@type": "Organization", "@id": "https://www.funnyteesforall.com/#organization", name: "No Context Club", url: "https://www.funnyteesforall.com/" });
  });
  it("uses visible breadcrumb names and clean public URLs", () => {
    expect(breadcrumbJsonLd(product)).toEqual({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shop all", item: "https://www.funnyteesforall.com/products" },
      { "@type": "ListItem", position: 2, name: "Falling apart", item: "https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee" }
    ] });
  });
  it("escapes script termination while preserving JSON values and ampersands", () => {
    const value = { name: "</script><script>alert(1)</script>", description: "Cats & coffee" };
    const encoded = serializeJsonLd(value);
    expect(encoded).not.toContain("<");
    expect(encoded).toContain("Cats & coffee");
    expect(JSON.parse(encoded)).toEqual(value);
  });
});
