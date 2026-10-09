import { afterEach, describe, expect, it, vi } from "vitest";
import { toCartItemInputs } from "./cart";
import { checkoutRequestSchema } from "./validation";

const validRequest = {
  recipient: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    address1: "Calle Mayor 1",
    city: "Madrid",
    countryCode: "es",
    zip: "28013"
  },
  items: [{ productId: "shirt-black-l", syncVariantId: 123, quantity: 1 }],
  shippingRateId: "STANDARD"
};

describe("checkoutRequestSchema", () => {
  it("rejects overlong public request strings", () => {
    expect(() =>
      checkoutRequestSchema.parse({
        ...validRequest,
        recipient: { ...validRequest.recipient, name: "a".repeat(121) }
      })
    ).toThrow();

    expect(() => checkoutRequestSchema.parse({ ...validRequest, shippingRateId: "a".repeat(121) })).toThrow();
  });

  it("rejects unknown public request properties", () => {
    expect(() => checkoutRequestSchema.parse({ ...validRequest, ignored: true })).toThrow();
    expect(() =>
      checkoutRequestSchema.parse({
        ...validRequest,
        recipient: { ...validRequest.recipient, ignored: true }
      })
    ).toThrow();
    expect(() =>
      checkoutRequestSchema.parse({
        ...validRequest,
        items: [{ ...validRequest.items[0], ignored: true }]
      })
    ).toThrow();
  });

  it("accepts serialized storefront cart lines without UI-only fields", () => {
    const storefrontCart = [
      {
        productId: "shirt-black-l",
        syncVariantId: 123,
        quantity: 1,
        label: "Test Shirt - Black / L",
        price: "24.99",
        currency: "USD"
      }
    ];

    expect(
      checkoutRequestSchema.parse({
        ...validRequest,
        items: toCartItemInputs(storefrontCart)
      })
    ).toEqual({
      ...validRequest,
      recipient: { ...validRequest.recipient, countryCode: "ES" },
      items: [{ productId: "shirt-black-l", syncVariantId: 123, quantity: 1 }]
    });
  });
});

describe("shipping country availability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("omits Canada and the United Kingdom from configured shipping countries", async () => {
    vi.stubEnv("ALLOWED_SHIPPING_COUNTRIES", "CA,GB,US,ES,FR,DE,IT,PT");
    vi.resetModules();

    const { getAllowedShippingCountries } = await import("./env");

    expect(getAllowedShippingCountries()).toEqual(["US", "ES", "FR", "DE", "IT", "PT"]);
  });

  it("defaults to the first enabled destination when a disabled country is configured first", async () => {
    vi.stubEnv("ALLOWED_SHIPPING_COUNTRIES", "CA,GB,ES,US");
    vi.resetModules();

    const { getDefaultShippingCountry } = await import("./env");

    expect(getDefaultShippingCountry()).toBe("ES");
  });

  it.each(["CA", "GB"])("rejects %s even when the runtime configuration includes it", async (countryCode) => {
    vi.stubEnv("ALLOWED_SHIPPING_COUNTRIES", "CA,GB,US,ES,FR,DE,IT,PT");
    vi.resetModules();

    const { assertAllowedCountry } = await import("./validation");

    expect(() => assertAllowedCountry(countryCode)).toThrow(`Shipping country ${countryCode} is not enabled for this store.`);
  });
});
