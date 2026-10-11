import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ShippingEligibilityError } from "./shipping-eligibility";
const mocks = vi.hoisted(() => ({ quote: vi.fn(), checkout: vi.fn() }));
vi.mock("@/lib/order-service", () => ({ quoteShipping: mocks.quote, createCheckout: mocks.checkout }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitRequest: () => ({ allowed: true }) }));
import { POST as quote } from "../app/api/shipping/rates/route";
import { POST as checkout } from "../app/api/checkout/route";
const body = { recipient: { name: "Ada", email: "ada@example.com", address1: "Test Street 1", city: "Madrid", countryCode: "ES", zip: "28001" }, items: [{ productId: "101", syncVariantId: 201, quantity: 1 }] };
beforeEach(() => vi.resetAllMocks());
it.each([["EU_CUSTOMS_RISK", 409], ["SHIPPING_CHECK_UNAVAILABLE", 503], ["SHIPPING_OPTIONS_CHANGED", 409]] as const)("both POST routes expose %s", async (code, status) => {
  mocks.quote.mockRejectedValue(new ShippingEligibilityError(code)); mocks.checkout.mockRejectedValue(new ShippingEligibilityError(code));
  for (const handler of [quote, checkout]) {
    const response = await handler(new NextRequest("http://localhost/api/test", { method: "POST", body: JSON.stringify(handler === checkout ? { ...body, shippingRateId: "STANDARD" } : body) }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: new ShippingEligibilityError(code).message, code });
  }
});
it.each([{ customsFeesPossible: false }, { rate: "0.00" }, { eligible: true }])("rejects forged client evidence %# before service calls", async forged => {
  for (const handler of [quote, checkout]) {
    const response = await handler(new NextRequest("http://localhost/api/test", { method: "POST", body: JSON.stringify({ ...body, ...(handler === checkout ? { shippingRateId: "STANDARD" } : {}), ...forged }) }));
    expect(response.status).toBe(400);
  }
  expect(mocks.quote).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled();
});
