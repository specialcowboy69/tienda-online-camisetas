import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import CancelPage from "./cancel/page";
import RootLayout, { metadata } from "./layout";
import SuccessPage from "./success/page";
import { Storefront } from "@/components/storefront";

const spanishCustomerCopy = /Pedido|Pago|Volver|Gratis|Camisetas/;

describe("customer-facing language", () => {
  beforeAll(() => {
    vi.stubGlobal("React", React);
  });

  it("declares English as the storefront language", () => {
    const html = renderToStaticMarkup(createElement(RootLayout, null, createElement("div", null, "content")));

    expect(html).toContain('<html lang="en">');
    expect(metadata).toMatchObject({
      title: "No Context Club",
      description: "Funny graphic tees for whatever that was."
    });
  });

  it("renders public checkout support pages in English", async () => {
    const successHtml = renderToStaticMarkup(
      await SuccessPage({ searchParams: Promise.resolve({ order_id: "order_123" }) })
    );
    const cancelHtml = renderToStaticMarkup(await CancelPage({ searchParams: Promise.resolve({}) }));

    expect(successHtml).toContain("Order confirmed");
    expect(successHtml).toContain("Payment received");
    expect(successHtml).toContain("Back to shop");
    expect(cancelHtml).toContain("Checkout canceled");
    expect(cancelHtml).toContain("Payment canceled");
    expect(cancelHtml).toContain("Back to shop");
    expect(`${successHtml}\n${cancelHtml}`).not.toMatch(spanishCustomerCopy);
  });

  it("renders the storefront checkout shell in English", () => {
    const html = renderToStaticMarkup(
      createElement(Storefront, {
        products: [],
        allowedCountries: ["US"],
        defaultCountry: "US"
      })
    );

    expect(html).toContain("No products synced yet.");
    expect(html).toContain("Checkout");
    expect(html).toContain("Cart is empty.");
    expect(html).toContain("Calculate shipping");
    expect(html).toContain("Pay with Stripe");
    expect(html).not.toMatch(spanishCustomerCopy);
  });
});
