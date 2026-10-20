import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalogProduct } from "./firestore";
import { productContentById } from "./product-content";
import { productSeoContentById } from "./product-seo-content";
import { filterPublicProducts, getPublicProductBySlug, isPublicProduct } from "./storefront-publication";
import type { CatalogProduct } from "./types";
vi.mock("./firestore", () => ({ getCatalogProduct: vi.fn() }));
vi.mock("./product-content", () => ({ productContentById: { "468682936": { status: "verified" } } }));
const product: CatalogProduct = { id: "468682936", storefrontImage: "https://example.com/tee.webp", name: "Falling apart", updatedAt: "2026-10-19T00:00:00Z", variants: [], syncProductId: 468682936 };
describe("storefront publication", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps sold-out products public", () => expect(isPublicProduct(product)).toBe(true));
  it("excludes unregistered and ignored products", () => {
    expect(isPublicProduct({ ...product, id: "999999999" })).toBe(false);
    expect(isPublicProduct({ ...product, isIgnored: true })).toBe(false);
  });
  it("requires an HTTP(S) main image", () => {
    expect(isPublicProduct({ ...product, storefrontImage: "", thumbnail: "" })).toBe(false);
    expect(isPublicProduct({ ...product, storefrontImage: "javascript:alert(1)" })).toBe(false);
  });
  it("requires verified editorial content", () => {
    const content = productContentById[product.id];
    delete productContentById[product.id];
    try { expect(isPublicProduct(product)).toBe(false); } finally { productContentById[product.id] = content; }
  });
  it("does not publish a product without editorial SEO metadata", () => {
    const metadata = productSeoContentById[product.id];
    delete productSeoContentById[product.id];
    try { expect(isPublicProduct(product)).toBe(false); } finally { productSeoContentById[product.id] = metadata; }
  });
  it("filters without changing order", () => expect(filterPublicProducts([product, { ...product, id: "999999999" }])).toEqual([product]));
  it("does not read Firestore for unknown slugs", async () => {
    await expect(getPublicProductBySlug("unknown")).resolves.toBeNull();
    expect(getCatalogProduct).not.toHaveBeenCalled();
  });
  it("resolves public products and excludes ignored products", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValueOnce(product).mockResolvedValueOnce({ ...product, isIgnored: true }).mockResolvedValueOnce(null);
    await expect(getPublicProductBySlug("falling-apart-cat-graphic-tee")).resolves.toEqual(product);
    await expect(getPublicProductBySlug("falling-apart-cat-graphic-tee")).resolves.toBeNull();
    await expect(getPublicProductBySlug("falling-apart-cat-graphic-tee")).resolves.toBeNull();
  });
  it("propagates transient read errors", async () => {
    vi.mocked(getCatalogProduct).mockRejectedValue(new Error("temporarily unavailable"));
    await expect(getPublicProductBySlug("falling-apart-cat-graphic-tee")).rejects.toThrow("temporarily unavailable");
  });
});
