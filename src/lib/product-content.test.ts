import { describe, expect, it } from "vitest";
import { productContentById, productPolicies } from "./product-content";
import { productSlugEntries } from "./product-slugs";

describe("product content", () => {
  it("has verified storefront copy for every planned product slug", () => {
    for (const entry of productSlugEntries) {
      const content = productContentById[entry.productId];

      expect(content?.status).toBe("verified");
      expect(content?.summary).toBeTruthy();
      expect(content?.fitFeel.length).toBeGreaterThan(0);
      expect(content?.specs.length).toBeGreaterThan(0);
      expect(content?.situation?.heading).toBeTruthy();
      expect(content?.situation?.body).toBeTruthy();
      expect(content?.situation?.tags.length).toBe(3);
      expect(content?.supplierContext?.supplier).toBeTruthy();
      expect(content?.supplierContext?.whatApplies).toBeTruthy();
      expect(content?.supplierContext?.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("keeps the documented Falling Apart situation tied to the visual joke", () => {
    expect(productContentById["468682936"].situation).toEqual({
      heading: "EVERYONE IS COPING DIFFERENTLY.",
      body:
        "There was coffee. There was a volcano. The cat arrived dressed for a floral apocalypse and chose peace anyway. Everything is falling apart. She's just fine.",
      tags: ["CAT", "COFFEE", "VOLCANO"]
    });
  });

  it("keeps visible product copy free of em dashes", () => {
    const visibleStrings = [
      ...Object.values(productContentById).flatMap((content) => [
        content.heading,
        content.summary,
        content.specsTitle,
        content.customerNote || "",
        content.situation?.heading || "",
        content.situation?.body || "",
        content.supplierContext?.supplier || "",
        content.supplierContext?.whatApplies || "",
        content.supplierContext?.note || "",
        content.supplierContext?.sourceLabel || "",
        ...content.fitFeel,
        ...content.specs,
        ...(content.situation?.tags || [])
      ]),
      productPolicies.shipping.summary,
      productPolicies.returns.summary,
      ...productPolicies.shipping.details,
      ...productPolicies.returns.details
    ];

    expect(visibleStrings.join("\n")).not.toMatch(/[—–]/);
  });

  it("documents the customer-facing return window and support address", () => {
    expect(productPolicies.returns.summary).toContain("orders@funnyteesforall.com");
    expect(productPolicies.returns.summary).toContain("7 days");
  });
});
