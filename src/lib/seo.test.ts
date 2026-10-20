import { describe, expect, it } from "vitest";
import { canonicalUrl, pageMetadata, productMetadata } from "./seo";
import { productSeoContentById } from "./product-seo-content";
import { productSlugEntries } from "./product-slugs";
import type { CatalogProduct } from "./types";

describe("SEO contracts", () => {
  it("creates clean same-origin canonical URLs", () => {
    expect(canonicalUrl("/products/?utm_source=test#top")).toBe("https://www.funnyteesforall.com/products");
    expect(canonicalUrl("/")).toBe("https://www.funnyteesforall.com/");
    for (const path of ["//evil.example/x", "https://evil.example", "/\\evil", "/x\n", "/x\t"]) {
      expect(() => canonicalUrl(path)).toThrow();
    }
  });
  it("sets branded page and social metadata without invented images", () => {
    const metadata = pageMetadata({ path: "/products", title: "Shop Graphic Tees, Crop Tops & Hoodies", description: "Shop the drop." });
    expect(metadata.alternates?.canonical).toBe("https://www.funnyteesforall.com/products");
    expect(metadata.title).toBe("Shop Graphic Tees, Crop Tops & Hoodies | No Context Club");
    expect(metadata.openGraph).toMatchObject({ type: "website", siteName: "No Context Club", url: canonicalUrl("/products"), title: metadata.title, description: metadata.description });
    expect(metadata.twitter).toMatchObject({ card: "summary" });
    for (const image of ["javascript:alert(1)", "/invented.png", "invalid"]) {
      expect(pageMetadata({ path: "/", title: "Home", description: "Home", image }).openGraph).not.toHaveProperty("images");
    }
    expect(pageMetadata({ path: "/", title: "Home", description: "Home", image: "https://example.com/real.png" }).twitter).toMatchObject({ card: "summary_large_image", images: ["https://example.com/real.png"] });
  });
  it("covers every public ID with unique editorial titles and descriptions independent of provider names", () => {
    expect(Object.keys(productSeoContentById).sort()).toEqual(productSlugEntries.map(x => x.productId).sort());
    expect(new Set(Object.values(productSeoContentById).map(x => x.title)).size).toBe(5);
    expect(new Set(Object.values(productSeoContentById).map(x => x.description)).size).toBe(5);
    for (const entry of productSlugEntries) {
      const product: CatalogProduct = { id: entry.productId, syncProductId: 1, name: "Provider name", variants: [], updatedAt: "", thumbnail: "https://example.com/product.png" };
      expect(productMetadata(product)).toEqual(productMetadata({ ...product, name: "Changed provider name" }));
      expect(productMetadata(product)).toMatchObject({ title: productSeoContentById[entry.productId].title + " | No Context Club", description: productSeoContentById[entry.productId].description, alternates: { canonical: canonicalUrl("/products/" + entry.slug) } });
    }
  });
});
