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

  it("keeps support requests free of deadlines that reduce legal rights", () => {
    const returnsCopy = [productPolicies.returns.summary, ...productPolicies.returns.details].join("\n");

    expect(productPolicies.returns.summary).toContain("orders@funnyteesforall.com");
    expect(returnsCopy).not.toMatch(/(?:within|must be sent within) 7 days/i);
    expect(returnsCopy).toMatch(/no short reporting deadline reduces your legal rights/i);
    expect(returnsCopy).toMatch(/order number/i);
    expect(returnsCopy).toMatch(/description/i);
    expect(returnsCopy).toMatch(/reasonable photos/i);
  });

  it("explains included regions without promising free shipping in Canada or the UK", () => {
    const copy = productPolicies.shipping.summary;
    expect(copy).toMatch(/standard shipping is included for orders to the US, Spain, France, Germany, Italy, and Portugal/i);
    expect(copy).toMatch(/Canada and the UK.*charged at checkout/i);
    expect(copy).not.toMatch(/^Standard shipping is included\./i);
    expect(productPolicies.shipping.details.join("\n")).not.toMatch(/Canada only DDP standard/i);
  });

  it("offers refunds for store-responsible problems and preserves other legal remedies", () => {
    const returnsCopy = [productPolicies.returns.summary, ...productPolicies.returns.details].join("\n");

    expect(returnsCopy).toMatch(/damaged on arrival/i);
    expect(returnsCopy).toMatch(/manufacturing or printing defect/i);
    expect(returnsCopy).toMatch(/wrong item/i);
    expect(returnsCopy).toMatch(/another error attributable to us/i);
    expect(returnsCopy).toMatch(/request a refund/i);
    expect(returnsCopy).toMatch(/choose another legally available remedy/i);
    expect(returnsCopy).toMatch(/we cover necessary return or replacement costs/i);
    expect(returnsCopy).not.toMatch(/printful|production partner|supplier/i);
  });

  it("explains EU withdrawal and change-of-mind return costs without promising size exchanges", () => {
    const returnsCopy = productPolicies.returns.details.join("\n");

    expect(returnsCopy).toMatch(/standard catalog/i);
    expect(returnsCopy).toMatch(/14 days from delivery to notify us of withdrawal/i);
    expect(returnsCopy).toMatch(/another 14 days to return/i);
    expect(returnsCopy).toMatch(/direct return costs only if you were informed/i);
    expect(returnsCopy).toMatch(/unless applicable law or our agreement says otherwise/i);
    expect(returnsCopy).toMatch(/other returns and exchanges depend on applicable law and the circumstances/i);
    expect(returnsCopy).not.toMatch(/free size exchanges|all size exchanges|any size exchange/i);
  });
});
