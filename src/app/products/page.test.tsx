import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicCatalog } from "@/lib/public-catalog";
import type { CatalogProduct } from "@/lib/types";
import ProductsPage from "./page";

vi.mock("@/lib/public-catalog", () => ({ getPublicCatalog: vi.fn() }));

const product: CatalogProduct = {
  id: "468682936",
  syncProductId: 468682936,
  name: "Falling apart",
  storefrontImage: "https://example.com/falling-apart.webp",
  variants: [{
    syncVariantId: 1,
    variantId: 2,
    name: "Black / M",
    size: "M",
    color: "Black",
    retailPrice: "39.99",
    currency: "USD",
    availabilityStatus: "active"
  }],
  updatedAt: "2026-09-21T00:00:00.000Z"
};

describe("ProductsPage", () => {
  beforeAll(() => vi.stubGlobal("React", React));
  beforeEach(() => vi.resetAllMocks());

  it("renders every available catalog product with its real price and safe destination", async () => {
    const unmapped = { ...product, id: "999999999", syncProductId: 999999999, name: "New design", storefrontImage: undefined };
    vi.mocked(getPublicCatalog).mockResolvedValue({ products: [product, unmapped], status: "available" });

    const html = renderToStaticMarkup(await ProductsPage());

    expect(html).toContain("The First Drop");
    expect(html).toContain(product.name);
    expect(html).toContain(unmapped.name);
    expect(html).toContain("$39.99");
    expect(html).toContain('href="/products/falling-apart-cat-graphic-tee"');
    expect(html).not.toContain("/products/999999999");
    expect(html).toContain('href="/#about"');
    expect((html.match(/class="ncc-product-card"/g) ?? [])).toHaveLength(2);
  });

  it("renders the approved empty state", async () => {
    vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "available" });

    const html = renderToStaticMarkup(await ProductsPage());

    expect(html).toContain("Nothing here yet. Check back after the next questionable decision.");
    expect(html).not.toContain("ncc-product-card");
  });

  it("renders the safe unavailable state", async () => {
    vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "unavailable" });

    const html = renderToStaticMarkup(await ProductsPage());

    expect(html).toContain("The shop is temporarily unavailable. Please try again soon.");
    expect(html).not.toContain("FIREBASE_PROJECT_ID");
    expect(html).not.toContain("ncc-product-card");
  });
});
