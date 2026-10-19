import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/storefront-publication", () => ({ getPublicProductBySlug: vi.fn(), filterPublicProducts: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
import { getPublicProductBySlug } from "@/lib/storefront-publication";
import { metadata as home } from "./page";
import { metadata as catalog } from "./products/page";
import { generateMetadata } from "./products/[slug]/page";
import { metadata as admin } from "./admin/page";
import { metadata as success } from "./success/page";
import { metadata as cancel } from "./cancel/page";
import { metadata as privacy } from "./privacy/page";
import { metadata as cookies } from "./cookies/page";
import { metadata as layout } from "./layout";

describe("page SEO wiring", () => {
  it("gives home and catalog unique exact editorial metadata", () => {
    expect(home).toMatchObject({ title: "Funny Graphic Tees & Apparel | No Context Club", description: "Funny graphic tees, crop tops, and hoodies for pet drama, coffee disasters, and questionable decisions. Meet the first drop from No Context Club.", alternates: { canonical: "https://www.funnyteesforall.com/" } });
    expect(catalog).toMatchObject({ title: "Shop Graphic Tees, Crop Tops & Hoodies | No Context Club", description: "Explore the No Context Club drop: cat and dog graphic tees, a crop top, and a cropped hoodie. Find your design and check the fit, sizes, and details.", alternates: { canonical: "https://www.funnyteesforall.com/products" } });
  });
  it("keeps operational pages out of indexing without home canonicals", () => {
    for (const metadata of [admin, success, cancel]) {
      expect(metadata).toEqual({ robots: { index: false, follow: false } });
    }
  });
  it("adds only per-page legal canonicals and a root metadata base", () => {
    expect(privacy.alternates?.canonical).toBe("https://www.funnyteesforall.com/privacy");
    expect(cookies.alternates?.canonical).toBe("https://www.funnyteesforall.com/cookies");
    expect(layout.metadataBase?.toString()).toBe("https://www.funnyteesforall.com/");
    expect(layout.alternates).toBeUndefined();
    expect(layout.title).toBe("No Context Club");
  });
  it("returns notFound for a nonpublic product", async () => {
    vi.mocked(getPublicProductBySlug).mockResolvedValue(null);
    await expect(generateMetadata({ params: Promise.resolve({ slug: "hidden" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("uses the public resolver and editorial metadata for product pages", async () => {
    vi.mocked(getPublicProductBySlug).mockResolvedValue({ id: "468682936", syncProductId: 1, name: "Provider name", variants: [], updatedAt: "", thumbnail: "https://example.com/product.png" });
    expect(await generateMetadata({ params: Promise.resolve({ slug: "falling-apart-cat-graphic-tee" }) })).toMatchObject({ title: "Falling Apart Cat Graphic Tee | No Context Club" });
    expect(getPublicProductBySlug).toHaveBeenLastCalledWith("falling-apart-cat-graphic-tee");
  });
});
