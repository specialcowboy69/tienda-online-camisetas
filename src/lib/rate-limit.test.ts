import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupExpiredBuckets, rateLimit, rateLimitResponse } from "./rate-limit";

function requestWithHeaders(headers: HeadersInit): NextRequest {
  return new NextRequest("http://localhost/api/checkout", { headers });
}

async function loadGetClientIp(trustProxyHeaders: boolean) {
  vi.stubEnv("TRUST_PROXY_HEADERS", String(trustProxyHeaders));
  vi.resetModules();
  return (await import("./rate-limit")).getClientIp;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

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

  it("evicts expired buckets during later requests", () => {
    rateLimit("expired", { limit: 1, windowMs: 100, now: 0 });
    rateLimit("active", { limit: 1, windowMs: 1000, now: 500 });
    rateLimit("trigger", { limit: 1, windowMs: 1000, now: 500 });

    expect(cleanupExpiredBuckets(500)).toBe(0);
  });

  it("rejects invalid limit options", () => {
    expect(() => rateLimit("invalid-limit", { limit: 0, windowMs: 1000, now: 0 })).toThrow(RangeError);
    expect(() => rateLimit("invalid-window", { limit: 1, windowMs: Infinity, now: 0 })).toThrow(RangeError);
  });

  it("ignores forwarding headers unless proxy trust is enabled", async () => {
    const getClientIp = await loadGetClientIp(false);

    expect(getClientIp(requestWithHeaders({ "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" }))).toBe("unknown");
  });

  it("uses the first forwarded IP and falls back to x-real-ip for a trusted proxy", async () => {
    const getClientIp = await loadGetClientIp(true);

    expect(getClientIp(requestWithHeaders({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(getClientIp(requestWithHeaders({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
  });

  it("returns a positive Retry-After hint", () => {
    const response = rateLimitResponse(Date.now() + 1000);

    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
