import { describe, expect, it } from "vitest";
import { organizationJsonLd, breadcrumbJsonLd, productGroupJsonLd, serializeJsonLd } from "./structured-data";
import type { CatalogProduct } from "./types";
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Falling apart", variants: [], updatedAt: "2026-10-19T00:00:00Z" };
const black = { syncVariantId: 11, variantId: 111, name: "Black / M", color: "Black", size: "M", retailPrice: "29", currency: "usd", image: "https://example.com/black.webp" };
const blue = { syncVariantId: 22, variantId: 222, name: "Blue / L", color: "Blue", size: "L", retailPrice: "31", currency: "USD", image: "https://example.com/blue.webp" };
const variantProduct: CatalogProduct = { ...product, storefrontImage: "https://example.com/tee.webp", variants: [black, blue] };
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
  it("describes exact selectable variants with distinct offers and only real varying dimensions", () => {
    const graph = productGroupJsonLd(variantProduct);
    const clean = "https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee";
    expect(graph).toMatchObject({
      "@context": "https://schema.org", "@type": "ProductGroup", "@id": `${clean}#product-group`,
      productGroupID: product.id, url: clean, name: product.name,
      description: "Heavyweight, soft, and made for repeat wear. This relaxed-fit, garment-dyed tee has a structured feel without feeling stiff.",
      brand: { "@type": "Brand", name: "No Context Club" },
      variesBy: ["https://schema.org/color", "https://schema.org/size"],
      hasVariant: [
        { "@type": "Product", "@id": `${clean}#variant-11`, sku: "11", name: "Falling apart - Black / M", color: "Black", size: "M", image: black.image, url: `${clean}?variant=11`, isVariantOf: { "@id": `${clean}#product-group` }, offers: { "@type": "Offer", url: `${clean}?variant=11`, price: "29.00", priceCurrency: "USD" } },
        { "@type": "Product", "@id": `${clean}#variant-22`, sku: "22", name: "Falling apart - Blue / L", color: "Blue", size: "L", image: blue.image, url: `${clean}?variant=22`, isVariantOf: { "@id": `${clean}#product-group` }, offers: { "@type": "Offer", url: `${clean}?variant=22`, price: "31.00", priceCurrency: "USD" } }
      ]
    });
    expect(JSON.stringify(graph)).not.toMatch(/AggregateOffer|InStock|availability|aggregateRating|gtin|shippingDetails|hasMerchantReturnPolicy/);
  });
  it("includes only dimensions with multiple known values", () => {
    const graph = productGroupJsonLd({ ...variantProduct, variants: [black, { ...blue, color: "Black" }] });
    expect(graph?.variesBy).toEqual(["https://schema.org/size"]);
    expect(productGroupJsonLd({ ...variantProduct, variants: [black] })?.variesBy).toBeUndefined();
  });
  it("omits unpriced variants instead of inventing offers", () => {
    for (const retailPrice of ["", "NaN", "Infinity", "-1", "0", "1.001", " 29", "29e0", "9007199254740992", "999999999999999999999999999999999999"]) {
      const graph = productGroupJsonLd({ ...variantProduct, variants: [black, { ...blue, retailPrice }] });
      expect(graph?.hasVariant, retailPrice).toHaveLength(1);
    }
    expect(productGroupJsonLd({ ...variantProduct, variants: [{ ...black, retailPrice: "" }] })).toBeNull();
  });
  it("omits prices whose displayed USD cents differ from the Offer", () => {
    for (const retailPrice of ["90071992547409.91", "70368744177664.01", "70368744177664.04"]) {
      const graph = productGroupJsonLd({ ...variantProduct, variants: [black, { ...blue, retailPrice }] });
      expect(graph?.hasVariant, retailPrice).toHaveLength(1);
      expect(productGroupJsonLd({ ...variantProduct, variants: [{ ...black, retailPrice }] }), retailPrice).toBeNull();
    }
    for (const retailPrice of ["90071992547409.90", "70368744177664.02", "70368744177664.03", "0.01", "29.5"]) {
      const graph = productGroupJsonLd({ ...variantProduct, variants: [{ ...black, retailPrice }] });
      const offer = (graph?.hasVariant as Array<{ offers: { price: string } }> | undefined)?.[0].offers;
      expect(offer?.price, retailPrice).toBe(retailPrice === "29.5" ? "29.50" : retailPrice);
    }
  });
  it("omits unsafe images, IDs and ambiguous or inactive variants", () => {
    const invalid = [
      { ...blue, image: undefined }, { ...blue, image: "javascript:alert(1)" },
      { ...blue, syncVariantId: Number.MAX_SAFE_INTEGER + 1 },
      { ...blue, isIgnored: true }, { ...blue, availabilityStatus: "out_of_stock" },
      { ...blue, availabilityStatus: "discontinued" }
    ];
    for (const variant of invalid) {
      const graph = productGroupJsonLd({ ...variantProduct, variants: [black, variant] });
      expect(graph?.hasVariant, JSON.stringify(variant)).toHaveLength(1);
    }
    expect(productGroupJsonLd({ ...variantProduct, variants: [black, { ...blue, color: "Black", size: "M" }] })).toBeNull();
    expect(productGroupJsonLd({ ...variantProduct, variants: [] })).toBeNull();
  });
  it("rejects the entire group for mixed active currencies, including case differences in USD", () => {
    expect(productGroupJsonLd({ ...variantProduct, variants: [black, { ...blue, currency: "EUR" }] })).toBeNull();
    expect(productGroupJsonLd({ ...variantProduct, variants: [black, { ...blue, currency: "eur", isIgnored: true }] })?.hasVariant).toHaveLength(1);
  });
  it("keeps hostile variant text safe in the JSON-LD script", () => {
    const graph = productGroupJsonLd({ ...variantProduct, variants: [{ ...black, name: "</script><script>alert(1)</script>" }] });
    expect(serializeJsonLd(graph!)).not.toContain("<");
  });
});
