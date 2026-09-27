import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HomePageContent } from "./home-page-content";
import type { PublicCatalogResult } from "@/lib/public-catalog";
import type { CatalogProduct } from "@/lib/types";

const productWithSlugAndImage: CatalogProduct = {
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

const productWithoutSlug: CatalogProduct = {
  id: "999999999",
  syncProductId: 999999999,
  name: "New design",
  storefrontImage: undefined,
  storefrontImages: undefined,
  thumbnail: undefined,
  variants: [{
    syncVariantId: 3,
    variantId: 4,
    name: "Black / M",
    size: "M",
    color: "Black",
    retailPrice: "29.99",
    currency: "USD",
    availabilityStatus: "active"
  }],
  updatedAt: "2026-09-21T00:00:00.000Z"
};

function renderHome(catalog: PublicCatalogResult) {
  return renderToStaticMarkup(createElement(HomePageContent, { catalog }));
}

function createGalleryProduct(id: string, name: string, imagePrefix: string): CatalogProduct {
  return {
    id,
    syncProductId: Number(id),
    name,
    storefrontImage: `https://example.com/${imagePrefix}-main.webp`,
    storefrontImages: [
      `https://example.com/${imagePrefix}-main.webp`,
      `https://example.com/${imagePrefix}-fit.webp`,
      `https://example.com/${imagePrefix}-detail.webp`,
      `https://example.com/${imagePrefix}-lifestyle.webp`
    ],
    variants: [{
      syncVariantId: Number(id),
      variantId: Number(id),
      name: `${name} / Black / M`,
      size: "M",
      color: "Black",
      retailPrice: "39.99",
      currency: "USD",
      availabilityStatus: "active"
    }],
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

describe("HomePageContent", () => {
  beforeAll(() => vi.stubGlobal("React", React));

  it("renders the approved sections in order with real product destinations", () => {
    const html = renderHome({ products: [productWithSlugAndImage, productWithoutSlug], status: "available" });

    expect(html).toContain("Funny graphic tees for whatever that was.");
    expect(html).toContain('id="about"');
    expect(html).toContain("No context for the joke. Full context for the tee.");
    expect(html).toContain('href="/products/falling-apart-cat-graphic-tee"');
    expect(html).toContain('href="/products"');
    expect(html).toContain('alt="Falling apart"');
    expect(html).not.toContain("Admin");
    expect(html).not.toContain('src="undefined"');
    expect((html.match(/class="ncc-product-card"/g) ?? [])).toHaveLength(1);

    const sectionIds = ["ncc-home-title", "ncc-home-drop-title", "ncc-home-about-title", "ncc-home-proof-title", "ncc-home-context-title", "ncc-home-final-title"];
    const positions = sectionIds.map((id) => html.indexOf(`id="${id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("does not invent cards or image placeholders for an empty catalog", () => {
    const html = renderHome({ products: [], status: "available" });

    expect(html).not.toContain("ncc-product-card");
    expect(html).not.toContain("product view");
    expect(html).not.toContain("The shop is temporarily unavailable.");
    expect(html).toContain('href="/products"');
  });

  it("keeps the approved home campaign artwork independent from catalog availability", () => {
    const html = renderHome({ products: [], status: "available" });

    expect(html).toContain('src="https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/Imagenes%20web%20camisetas/home/no-context-club-home-hero.webp"');
    expect(html).toContain('alt="Woman wearing a No Context Club graphic tee at home with her cat"');
    expect(html).toContain('src="https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/Imagenes%20web%20camisetas/home/no-context-club-home-final-cta.webp"');
    expect(html).toContain('alt="Two friends wearing No Context Club graphic tees"');
  });

  it("shows a safe message on a catalog failure", () => {
    const html = renderHome({ products: [], status: "unavailable" });

    expect(html).toContain("The shop is temporarily unavailable. Please try again soon.");
    expect(html).not.toContain("FIREBASE_PROJECT_ID");
    expect(html).not.toContain("ncc-product-card");
  });

  it("keeps product links on the listing when no public slug exists", () => {
    const html = renderHome({ products: [productWithoutSlug], status: "available" });

    expect(html).not.toContain("/products/999999999");
    expect(html).not.toContain('src="undefined"');
    expect(html).toContain('href="/products"');
  });

  it("keeps a mapped product usable when no catalog image exists", () => {
    const productWithoutImage = {
      ...productWithSlugAndImage,
      storefrontImage: undefined,
      storefrontImages: undefined,
      thumbnail: undefined
    };
    const html = renderHome({ products: [productWithoutImage], status: "available" });

    expect(html).toContain('href="/products/falling-apart-cat-graphic-tee"');
    expect(html).toContain("ncc-product-card");
    expect(html).not.toContain("product view");
    expect(html).not.toContain('src="undefined"');
  });

  it("uses the available product photo and singular copy when only one design is present", () => {
    const html = renderHome({ products: [productWithSlugAndImage], status: "available" });

    expect(html).toContain("One design. Zero need to explain it.");
    expect(html).toContain("ncc-home-proof__gallery");
    expect(html).not.toContain("ncc-home-proof__graphic");
  });

  it("uses distinct real gallery photos for the editorial home sections", () => {
    const productWithGallery = {
      ...productWithSlugAndImage,
      storefrontImages: [
        "https://example.com/falling-apart.webp",
        "https://example.com/falling-apart-detail.webp",
        "https://example.com/falling-apart-front.webp",
        "https://example.com/falling-apart-lifestyle.webp"
      ]
    };
    const html = renderHome({ products: [productWithGallery], status: "available" });

    expect(html).toContain('src="https://example.com/falling-apart-front.webp"');
    expect(html).toContain('src="https://example.com/falling-apart-detail.webp"');
    expect(html).toContain('src="https://example.com/falling-apart-lifestyle.webp"');
    expect(html).toContain("ncc-home-proof__gallery");
    expect(html).toContain("ncc-home-context__visual");
  });

  it("assigns different catalog products to the editorial image blocks", () => {
    const products = [
      createGalleryProduct("468471370", "Momma sorry sweeter", "momma"),
      createGalleryProduct("468682936", "Falling apart", "falling"),
      createGalleryProduct("468520575", "Sorry i cant triblend", "sorry"),
      createGalleryProduct("468513582", "Farming dog aura", "farming"),
      createGalleryProduct("468502976", "Its a trap crop top", "trap")
    ];
    const html = renderHome({ products, status: "available" });
    const aboutStart = html.indexOf('<section id="about"');
    const proofStart = html.indexOf('<section class="ncc-home-proof"');
    const contextStart = html.indexOf('<section class="ncc-home-context"');
    const finalStart = html.indexOf('<section class="ncc-home-final"');
    const aboutHtml = html.slice(aboutStart, proofStart);
    const proofHtml = html.slice(proofStart, contextStart);
    const contextHtml = html.slice(contextStart, finalStart);

    expect(aboutHtml).toContain('src="https://example.com/farming-lifestyle.webp"');
    expect(aboutHtml).toContain('src="https://example.com/farming-detail.webp"');
    expect(aboutHtml).toContain('href="/products/farming-dog-aura-graphic-tee"');

    expect(proofHtml).toContain('src="https://example.com/sorry-fit.webp"');
    expect(proofHtml).toContain('alt="Sorry i cant triblend fit view"');
    expect(proofHtml).toContain('src="https://example.com/momma-detail.webp"');
    expect(proofHtml).toContain('alt="Momma sorry sweeter print detail"');
    expect(proofHtml).toContain('src="https://example.com/trap-lifestyle.webp"');
    expect(proofHtml).toContain('alt="Its a trap crop top lifestyle view"');
    expect(proofHtml).toContain('href="/products">Shop the drop');

    expect(contextHtml).toContain('src="https://example.com/falling-fit.webp"');
    expect(contextHtml).toContain('alt="Falling apart close-up"');
  });
});
