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
  const savedAddress = { name: "Ada", email: "ada@example.com", address1: "1 Main St", address2: "Apt 2", city: "New York", stateCode: "NY", countryCode: "US", zip: "10001" };
  const finalAddress = { line1: "1 Main St", line2: "Apt 2", city: "New York", state: "NY", country: "US", postal_code: "10001" };

  it("rejects missing Stripe shipping addresses", () => {
    expect(addressesMateriallyMatch(savedAddress, null)).toBe(false);
  });

  it.each(["line1", "city", "country", "postal_code"] as const)("rejects missing required address field %s", (field) => {
    expect(addressesMateriallyMatch(savedAddress, { ...finalAddress, [field]: "" })).toBe(false);
  });

  it.each(["line2", "state"] as const)("rejects changed or removed optional address field %s", (field) => {
    expect(addressesMateriallyMatch(savedAddress, { ...finalAddress, [field]: "Changed" })).toBe(false);
    expect(addressesMateriallyMatch(savedAddress, { ...finalAddress, [field]: null })).toBe(false);
  });

  it("rejects apartment and state additions", () => {
    expect(addressesMateriallyMatch({ ...savedAddress, address2: undefined }, finalAddress)).toBe(false);
    expect(addressesMateriallyMatch({ ...savedAddress, stateCode: undefined }, finalAddress)).toBe(false);
  });

  it("normalizes case, whitespace and absent optional fields", () => {
    expect(addressesMateriallyMatch({ ...savedAddress, address2: "", stateCode: undefined }, { ...finalAddress, line1: " 1 MAIN   ST ", line2: null, state: "" })).toBe(true);
  });

  it("accepts the Spanish Madrid name and province code in either direction", () => {
    const spanishSavedAddress = {
      ...savedAddress,
      city: "Madrid",
      stateCode: "Madrid",
      countryCode: "ES",
      zip: "28013"
    };
    const spanishFinalAddress = {
      ...finalAddress,
      city: "Madrid",
      state: "M",
      country: "ES",
      postal_code: "28013"
    };

    expect(addressesMateriallyMatch(spanishSavedAddress, spanishFinalAddress)).toBe(true);
    expect(
      addressesMateriallyMatch(
        { ...spanishSavedAddress, stateCode: "M" },
        { ...spanishFinalAddress, state: "Madrid" }
      )
    ).toBe(true);
  });

  it("keeps Spanish region aliases country-scoped and rejects a different province", () => {
    const spanishSavedAddress = {
      ...savedAddress,
      city: "Madrid",
      stateCode: "Madrid",
      countryCode: "ES",
      zip: "28013"
    };
    const spanishFinalAddress = {
      ...finalAddress,
      city: "Madrid",
      state: "M",
      country: "ES",
      postal_code: "28013"
    };

    expect(addressesMateriallyMatch(spanishSavedAddress, { ...spanishFinalAddress, state: "B" })).toBe(false);
    expect(
      addressesMateriallyMatch(
        { ...spanishSavedAddress, countryCode: "PT" },
        { ...spanishFinalAddress, country: "PT" }
      )
    ).toBe(false);
  });

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

  it.each(["US", "ES", "FR", "DE", "IT", "PT", " us "])("includes standard shipping for %s", (countryCode) => {
    expect(priceCustomerShippingRate(shippingRate, countryCode).rate).toBe("0.00");
    expect(shippingRate.rate).toBe("4.95");
  });

  it.each(["CA", "GB", " ca ", " gb "])("retains the quoted standard rate for %s", (countryCode) => {
    expect(priceCustomerShippingRate(shippingRate, countryCode)).toBe(shippingRate);
    expect(shippingRate.rate).toBe("4.95");
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
