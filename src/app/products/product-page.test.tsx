import { JsonLd } from "@/components/json-ld";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalogProduct, listCatalogProducts } from "@/lib/firestore";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { ProductFinalCallout } from "@/components/product-details";
import ProductPage, { generateMetadata } from "./[slug]/page";
import type { CatalogProduct } from "@/lib/types";
vi.mock("@/lib/firestore", () => ({ getCatalogProduct: vi.fn(), listCatalogProducts: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Falling apart", storefrontImage: "https://example.com/tee.webp", variants: [], updatedAt: "2026-10-19T00:00:00Z" };
const props = { params: Promise.resolve({ slug: "falling-apart-cat-graphic-tee" }) };
const variantProduct: CatalogProduct = { ...product, storefrontImages: ["https://example.com/other.webp"], variants: [
  { syncVariantId: 11, variantId: 111, name: "Black / M", color: "Black", size: "M", retailPrice: "29", currency: "USD", image: "https://example.com/black.webp" },
  { syncVariantId: 22, variantId: 222, name: "Blue / L", color: "Blue", size: "L", retailPrice: "31", currency: "USD", image: "https://example.com/blue.webp" }
] };
function findElements(node: React.ReactNode, type: unknown): React.ReactElement<Record<string, unknown>>[] {
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === type ? [node] : []), ...React.Children.toArray(node.props.children as React.ReactNode).flatMap(child => findElements(child, type))];
}
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
  it("matches schema breadcrumb to the visible navigation without Product or Offer", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue(product);
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const page = await ProductPage(props);
    function elements(node: React.ReactNode): React.ReactElement<{ children?: React.ReactNode; data?: Record<string, unknown>; "aria-label"?: string }>[] {
      if (!React.isValidElement<{ children?: React.ReactNode; data?: Record<string, unknown>; "aria-label"?: string }>(node)) return [];
      return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
    }
    const nodes = elements(page);
    const schema = nodes.filter(node => node.type === JsonLd);
    expect(schema).toHaveLength(1);
    const data = schema[0].props.data!;
    expect(data["@type"]).toBe("BreadcrumbList");
    const nav = nodes.find(node => node.type === "nav" && node.props["aria-label"] === "Breadcrumb");
    const html = renderToStaticMarkup(nav);
    expect(html).toContain('href="/products">Shop all</a>');
    expect(html).toContain('<span aria-current="page">Falling apart</span>');
    expect((data.itemListElement as { name: string }[]).map(item => item.name)).toEqual(["Shop all", "Falling apart"]);
    expect(JSON.stringify(data)).not.toMatch(/"@type":"(?:Product|Offer)"/);
  });
  it("uses the URL-selected variant for buybox, final price and initial gallery image", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue(variantProduct);
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const page = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: "22" }) });
    const panel = findElements(page, ProductPurchasePanel)[0];
    const gallery = findElements(page, ProductGallery)[0];
    const callout = findElements(page, ProductFinalCallout)[0];
    expect(panel.props.initialVariantId).toBe(22);
    expect(renderToStaticMarkup(panel)).toContain("$31.00");
    expect(gallery.props.initialImageSrc).toBe("https://example.com/blue.webp");
    expect(renderToStaticMarkup(gallery)).toContain('src="https://example.com/blue.webp"');
    expect(callout.props.priceLabel).toBe("$31.00");
    const metadata = await generateMetadata({ ...props, searchParams: Promise.resolve({ variant: "22" }) });
    expect(metadata.alternates?.canonical).toBe("https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee");
  });
  it("renders ProductGroup only for a public PDP with exactly selectable priced variant links", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue(variantProduct);
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const page = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: "22" }) });
    const scripts = findElements(page, JsonLd).map(node => node.props.data as Record<string, unknown>);
    expect(scripts.map(data => data["@type"])).toEqual(["BreadcrumbList", "ProductGroup"]);
    const group = scripts[1];
    const variants = group.hasVariant as Array<{ sku: string; image: string; offers: { url: string; price: string } }>;
    expect(variants.map(variant => variant.sku)).toEqual(["11", "22"]);
    expect(variants[1].offers).toMatchObject({ url: "https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee?variant=22", price: "31.00" });
    expect(variants[1].image).toBe("https://example.com/blue.webp");
    expect(findElements(page, ProductPurchasePanel)[0].props.initialVariantId).toBe(22);
    expect(findElements(page, ProductGallery)[0].props.initialImageSrc).toBe(variants[1].image);
  });
  it("keeps breadcrumb but omits ProductGroup when no safe offer remains", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue({ ...variantProduct, variants: [{ ...variantProduct.variants[0], retailPrice: "NaN" }] });
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const page = await ProductPage(props);
    expect(findElements(page, JsonLd).map(node => (node.props.data as Record<string, unknown>)["@type"])).toEqual(["BreadcrumbList"]);
  });
  it("uses fresh keyed instances on query navigation and falls back for invalid requests", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue(variantProduct);
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const blue = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: "22" }) });
    const black = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: "11" }) });
    const invalid = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: ["22", "11"] }) });
    for (const component of [ProductPurchasePanel, ProductGallery]) {
      expect(findElements(blue, component)[0].key).not.toBe(findElements(black, component)[0].key);
    }
    expect(findElements(black, ProductPurchasePanel)[0].props.initialVariantId).toBe(11);
    expect(findElements(invalid, ProductPurchasePanel)[0].props.initialVariantId).toBeUndefined();
    expect(findElements(invalid, ProductFinalCallout)[0].props.priceLabel).toBe("$29.00");
    expect(findElements(invalid, ProductGallery)[0].props.initialImageSrc).toBeUndefined();
  });
  it("keeps existing gallery images when the selected variant image was absent", () => {
    const html = renderToStaticMarkup(<ProductGallery productName="Falling apart" images={[{ src: "https://example.com/tee.webp", alt: "Main" }]} initialImageSrc="https://example.com/blue.webp" />);
    expect(html).toContain('<img src="https://example.com/blue.webp"');
    expect(html).toContain('src="https://example.com/tee.webp"');
  });
  it("falls back consistently when the requested variant cannot be selected by the panel", async () => {
    vi.mocked(getCatalogProduct).mockResolvedValue({ ...variantProduct, variants: [
      variantProduct.variants[0], { ...variantProduct.variants[1], color: "Black", size: undefined }
    ] });
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const page = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: "22" }) });
    const panel = findElements(page, ProductPurchasePanel)[0];
    expect(panel.props.initialVariantId).toBeUndefined();
    expect(renderToStaticMarkup(panel)).toContain("$29.00");
    expect(findElements(page, ProductFinalCallout)[0].props.priceLabel).toBe("$29.00");
    expect(findElements(page, ProductGallery)[0].props.initialImageSrc).toBeUndefined();
  });
  it("falls back to the visible first option for a whitespace-colliding variant URL", async () => {
    const first = { ...variantProduct.variants[0], color: "Blue", size: "M" };
    const padded = { ...variantProduct.variants[1], color: " Blue ", size: "M" };
    vi.mocked(getCatalogProduct).mockResolvedValue({ ...variantProduct, variants: [first, padded] });
    vi.mocked(listCatalogProducts).mockResolvedValue([]);
    const page = await ProductPage({ ...props, searchParams: Promise.resolve({ variant: "22" }) });
    const panel = findElements(page, ProductPurchasePanel)[0];
    expect(panel.props.initialVariantId).toBeUndefined();
    expect(renderToStaticMarkup(panel)).toContain('<button aria-pressed="true" class="ncc-choice" type="button">Blue</button>');
    expect(renderToStaticMarkup(panel)).toContain("$29.00");
    expect(findElements(page, ProductFinalCallout)[0].props.priceLabel).toBe("$29.00");
    expect(findElements(page, ProductGallery)[0].props.initialImageSrc).toBeUndefined();
    expect(findElements(page, JsonLd).map(node => (node.props.data as Record<string, unknown>)["@type"])).toEqual(["BreadcrumbList"]);
  });
});
