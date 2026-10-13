import React, { type ReactElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import ProductsPage from "./products/page";
import ProductPage from "./products/[slug]/page";
import RootLayout from "./layout";
import { AnalyticsConsentProvider } from "@/components/analytics-consent";
import { AnalyticsPageRegistration } from "@/components/analytics-page";
import { getPublicCatalog } from "@/lib/public-catalog";
import { getCatalogProduct, listCatalogProducts } from "@/lib/firestore";
import type { CatalogProduct } from "@/lib/types";

vi.mock("@/lib/public-catalog", () => ({ getPublicCatalog: vi.fn() }));
vi.mock("@/lib/firestore", () => ({ getCatalogProduct: vi.fn(), listCatalogProducts: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, usePathname: () => "/" }));
beforeAll(() => vi.stubGlobal("React", React));
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "available" }); vi.mocked(listCatalogProducts).mockResolvedValue([]); });

function nodes(node: React.ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props.children as React.ReactNode).flatMap(child => nodes(child, type))];
}
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Private arbitrary title", variants: [], updatedAt: "2026-10-13" };

describe("analytics page boundary", () => {
  it("mounts one provider without catalog reads", () => {
    expect(nodes(RootLayout({ children: "content" }), AnalyticsConsentProvider)).toHaveLength(1);
    expect(getPublicCatalog).not.toHaveBeenCalled();
  });
  it("registers fixed home and catalog descriptors without extra reads", async () => {
    expect(nodes(await HomePage(), AnalyticsPageRegistration).map(n => n.props)).toEqual([{ path: "/", title: "Home" }]);
    expect(nodes(await ProductsPage(), AnalyticsPageRegistration).map(n => n.props)).toEqual([{ path: "/products", title: "Products" }]);
    expect(getPublicCatalog).toHaveBeenCalledTimes(2);
  });
  it("registers a valid PDP with no product/customer data", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue(product);
    const page = await ProductPage({ params: Promise.resolve({ slug: "falling-apart-cat-graphic-tee" }) });
    expect(nodes(page, AnalyticsPageRegistration).map(n => n.props)).toEqual([{ path: "/products/falling-apart-cat-graphic-tee", title: "Product" }]);
    expect(getCatalogProduct).toHaveBeenCalledTimes(1);
    expect(listCatalogProducts).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...product, isIgnored: true }])("does not render missing or ignored products", async (value) => {
    vi.mocked(getCatalogProduct).mockResolvedValue(value);
    await expect(ProductPage({ params: Promise.resolve({ slug: "falling-apart-cat-graphic-tee" }) })).rejects.toThrow("NOT_FOUND");
    expect(listCatalogProducts).not.toHaveBeenCalled();
  });
  it("does not even read an unknown product", async () => {
    await expect(ProductPage({ params: Promise.resolve({ slug: "private@example.com" }) })).rejects.toThrow("NOT_FOUND");
    expect(getCatalogProduct).not.toHaveBeenCalled();
  });
});
