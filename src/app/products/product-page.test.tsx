import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalogProduct, listCatalogProducts } from "@/lib/firestore";
import { ProductCard } from "@/components/product-card";
import ProductPage, { generateMetadata } from "./[slug]/page";
import type { CatalogProduct } from "@/lib/types";
vi.mock("@/lib/firestore", () => ({ getCatalogProduct: vi.fn(), listCatalogProducts: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Falling apart", storefrontImage: "https://example.com/tee.webp", variants: [], updatedAt: "2026-10-19T00:00:00Z" };
const props = { params: Promise.resolve({ slug: "falling-apart-cat-graphic-tee" }) };
beforeAll(() => vi.stubGlobal("React", React));
beforeEach(() => vi.resetAllMocks());
describe("public product page", () => {
  it.each([null, { ...product, isIgnored: true }, { ...product, storefrontImage: "" }])("stops unpublished products before metadata or related reads", async (value) => {
    vi.mocked(getCatalogProduct).mockResolvedValue(value);
    await expect(generateMetadata(props)).rejects.toThrow("NOT_FOUND");
    await expect(ProductPage(props)).rejects.toThrow("NOT_FOUND");
    expect(listCatalogProducts).not.toHaveBeenCalled();
  });
  it("rejects unknown slugs without reads", async () => {
    const unknown = { params: Promise.resolve({ slug: "unknown" }) };
    await expect(generateMetadata(unknown)).rejects.toThrow("NOT_FOUND");
    await expect(ProductPage(unknown)).rejects.toThrow("NOT_FOUND");
    expect(getCatalogProduct).not.toHaveBeenCalled();
    expect(listCatalogProducts).not.toHaveBeenCalled();
  });
  it("propagates Firestore failures", async () => {
    vi.mocked(getCatalogProduct).mockRejectedValue(new Error("temporary"));
    await expect(generateMetadata(props)).rejects.toThrow("temporary");
    await expect(ProductPage(props)).rejects.toThrow("temporary");
  });
  it("renders no invalid product card", () => {
    expect(renderToStaticMarkup(<ProductCard product={{ ...product, isIgnored: true }} />)).toBe("");
  });
  it("keeps sold-out metadata and filters related products before the limit", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue(product);
    vi.mocked(listCatalogProducts).mockResolvedValue([
      product, { ...product, id: "999999999", name: "Hidden" },
      ...["468513582", "468520575", "468502976", "468471370"].map(id => ({ ...product, id }))
    ]);
    await expect(generateMetadata(props)).resolves.toHaveProperty("title", "Falling Apart Cat Graphic Tee | No Context Club");
    const page = await ProductPage(props);
    function cards(node: React.ReactNode): CatalogProduct[] {
      if (!React.isValidElement<{ children?: React.ReactNode; product?: CatalogProduct }>(node)) return [];
      return [...(node.type === ProductCard && node.props.product ? [node.props.product] : []), ...React.Children.toArray(node.props.children).flatMap(cards)];
    }
    expect(cards(page).map(p => p.id)).toEqual(["468513582", "468520575", "468502976"]);
  });
});
