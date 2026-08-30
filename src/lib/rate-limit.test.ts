import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows requests up to the limit inside a window", () => {
    expect(rateLimit("checkout:1.2.3.4", { limit: 2, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(rateLimit("checkout:1.2.3.4", { limit: 2, windowMs: 1000, now: 200 }).allowed).toBe(true);
    expect(rateLimit("checkout:1.2.3.4", { limit: 2, windowMs: 1000, now: 300 }).allowed).toBe(false);
  });

  it("resets after the window", () => {
    expect(rateLimit("shipping:5.6.7.8", { limit: 1, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(rateLimit("shipping:5.6.7.8", { limit: 1, windowMs: 1000, now: 1200 }).allowed).toBe(true);
  });
});
