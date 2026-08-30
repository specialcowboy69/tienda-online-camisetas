import { describe, expect, it } from "vitest";
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
});
