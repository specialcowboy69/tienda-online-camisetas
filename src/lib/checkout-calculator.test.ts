import { describe, expect, it } from "vitest";
import {
  addressesMateriallyMatch,
  buildOrderItems,
  calculateTotals,
  createDraftOrder,
  priceCustomerShippingRate
} from "./checkout-calculator";
import { CatalogProduct, CartItemInput, ShippingRate } from "./types";

const product: CatalogProduct = {
  id: "101",
  syncProductId: 101,
  name: "Test Shirt",
  thumbnail: "https://example.com/shirt.png",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [
    {
      syncVariantId: 201,
      variantId: 301,
      name: "Black / L",
      size: "L",
      color: "Black",
      retailPrice: "25.50",
      currency: "eur",
      image: "https://example.com/variant.png",
      availabilityStatus: "active"
    }
  ]
};

const shippingRate: ShippingRate = {
  id: "STANDARD",
  name: "Standard",
  rate: "4.95",
  currency: "EUR"
};

describe("checkout calculator", () => {
  it("builds order items from synced Printful variants", () => {
    const cart: CartItemInput[] = [{ productId: "101", syncVariantId: 201, quantity: 2 }];
    const items = buildOrderItems(cart, [product]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      syncVariantId: 201,
      variantId: 301,
      quantity: 2,
      unitAmount: 2550,
      currency: "eur"
    });
  });

  it("rejects unavailable variants", () => {
    const unavailableProduct: CatalogProduct = {
      ...product,
      variants: [{ ...product.variants[0], availabilityStatus: "out_of_stock" }]
    };

    expect(() => buildOrderItems([{ productId: "101", syncVariantId: 201, quantity: 1 }], [unavailableProduct])).toThrow("not available");
  });

  it("calculates subtotal, shipping and total in minor units", () => {
    const items = buildOrderItems([{ productId: "101", syncVariantId: 201, quantity: 2 }], [product]);
    const totals = calculateTotals(items, shippingRate);

    expect(totals).toEqual({
      subtotal: 5100,
      shipping: 495,
      total: 5595,
      currency: "eur"
    });
  });

  it("prices standard customer shipping as free for every country", () => {
    expect(priceCustomerShippingRate(shippingRate, "US").rate).toBe("0.00");
    expect(priceCustomerShippingRate(shippingRate, "ES").rate).toBe("0.00");
    expect(priceCustomerShippingRate(shippingRate, "CA").rate).toBe("0.00");
  });

  it("prices Printful fast customer shipping as free only for the United States", () => {
    const fastRate = { ...shippingRate, id: "PRINTFUL_FAST", name: "Express" };

    expect(priceCustomerShippingRate(fastRate, "US").rate).toBe("0.00");
    expect(priceCustomerShippingRate(fastRate, "ES").rate).toBe("4.95");
  });

  it("keeps non-standard customer shipping rates outside the included shipping rules", () => {
    const carbonOffsetRate = { ...shippingRate, id: "STANDARD_CARBON_OFFSET", name: "Standard carbon offset" };

    expect(priceCustomerShippingRate(carbonOffsetRate, "US").rate).toBe("4.95");
    expect(priceCustomerShippingRate(carbonOffsetRate, "ES").rate).toBe("4.95");
  });

  it("creates order IDs accepted by Printful external ID limits", () => {
    const items = buildOrderItems([{ productId: "101", syncVariantId: 201, quantity: 1 }], [product]);
    const order = createDraftOrder({
      recipient: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        address1: "Calle Mayor 1",
        city: "Madrid",
        countryCode: "ES",
        zip: "28013"
      },
      items,
      shippingRate,
      totals: calculateTotals(items, shippingRate)
    });

    expect(order.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("detects material address changes from Stripe Checkout", () => {
    const saved = {
      name: "Ada Lovelace",
      email: "ada@example.com",
      address1: "Calle Mayor 1",
      city: "Madrid",
      countryCode: "ES",
      zip: "28013"
    };

    expect(
      addressesMateriallyMatch(saved, {
        line1: "Calle Mayor 1",
        city: "Madrid",
        country: "ES",
        postal_code: "28013"
      })
    ).toBe(true);

    expect(
      addressesMateriallyMatch(saved, {
        line1: "Different Street",
        city: "Madrid",
        country: "ES",
        postal_code: "28013"
      })
    ).toBe(false);
  });
});
