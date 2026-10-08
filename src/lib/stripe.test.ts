import { afterEach, describe, expect, it, vi } from "vitest";
import * as stripe from "./stripe";

describe("bounded Stripe reads", () => {
  afterEach(() => vi.useRealTimers());
  it("stops waiting at twenty seconds even when the SDK never settles", async () => {
    vi.useFakeTimers();
    expect(stripe).toHaveProperty("readStripeWithinDeadline");
    const result = stripe.readStripeWithinDeadline(() => new Promise(() => {}));
    const rejected = expect(result).rejects.toMatchObject({ name: "StripeReadDeadlineExceeded" });
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
  });
  it("sets bounded SDK options and returns the authoritative response", async () => {
    expect(stripe).toHaveProperty("readStripeWithinDeadline");
    let options: unknown;
    const result = await stripe.readStripeWithinDeadline(async (value) => { options = value; return { amount_received: 2200 }; });
    expect(options).toEqual({ timeout: 20000, maxNetworkRetries: 0 });
    expect(result).toEqual({ amount_received: 2200 });
  });
});

describe("Stripe Checkout return URLs", () => {
  it("keeps internal order IDs out of public return URLs", () => {
    expect(stripe.buildCheckoutReturnUrls("https://www.funnyteesforall.com")).toEqual({
      successUrl: "https://www.funnyteesforall.com/success",
      cancelUrl: "https://www.funnyteesforall.com/cancel"
    });
  });
});

describe("Stripe Checkout shipping country", () => {
  it("locks the address collection to the country used to price shipping", () => {
    expect(stripe.checkoutAllowedCountries("US")).toEqual(["US"]);
    expect(stripe.checkoutAllowedCountries("ca")).toEqual(["CA"]);
    expect(stripe.checkoutAllowedCountries("GB")).toEqual(["GB"]);
  });
});
