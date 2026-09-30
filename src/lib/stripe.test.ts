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
