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
    }
  });

  it("keeps visible product copy free of em dashes", () => {
    const visibleStrings = [
      ...Object.values(productContentById).flatMap((content) => [
        content.heading,
        content.summary,
        content.specsTitle,
        content.customerNote || "",
        ...content.fitFeel,
        ...content.specs
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
