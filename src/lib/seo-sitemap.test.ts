import { describe, expect, it } from "vitest";
import { getSitemapUrls, serializeSitemap } from "./seo-sitemap";
import type { CatalogProduct } from "./types";
const product: CatalogProduct = { id: "468682936", syncProductId: 468682936, name: "Tee", storefrontImage: "https://example.com/tee.webp", variants: [], updatedAt: "2026-10-19T00:00:00Z" };
const staticUrls = ["https://www.funnyteesforall.com/", "https://www.funnyteesforall.com/products", "https://www.funnyteesforall.com/privacy", "https://www.funnyteesforall.com/cookies"];
describe("sitemap", () => {
  it("includes only static pages and public stable product URLs", () => {
    expect(getSitemapUrls([product, { ...product, id: "unknown" }, { ...product, id: "468513582", isIgnored: true }])).toEqual([...staticUrls, "https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee"]);
  });
  it("returns static routes for a successfully empty catalog", () => expect(getSitemapUrls([])).toEqual(staticUrls));
  it("deduplicates and sorts product URLs independently of catalog order", () => {
    const second = { ...product, id: "468513582" };
    const expected = [...staticUrls, "https://www.funnyteesforall.com/products/falling-apart-cat-graphic-tee", "https://www.funnyteesforall.com/products/farming-dog-aura-graphic-tee"];
    expect(getSitemapUrls([second, product, second])).toEqual(expected);
    expect(getSitemapUrls([product, second])).toEqual(expected);
  });
  it("emits nine URLs for the five public products without synthetic dates", () => {
    const products = ["468682936", "468513582", "468520575", "468502976", "468471370"].map(id => ({ ...product, id }));
    const urls = getSitemapUrls(products);
    expect(urls).toHaveLength(9);
    expect(urls.every(url => !/[?#]/.test(url) && !/\/(api|admin|success|cancel)(\/|$)/.test(new URL(url).pathname))).toBe(true);
    const xml = serializeSitemap(urls);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).not.toContain("lastmod");
    expect(xml.match(/<loc>/g)).toHaveLength(9);
  });
  it("escapes all XML special characters", () => {
    expect(serializeSitemap(['https://example.com/?x=<&y=">\''])).toContain('<loc>https://example.com/?x=&lt;&amp;y=&quot;&gt;&apos;</loc>');
  });
});
