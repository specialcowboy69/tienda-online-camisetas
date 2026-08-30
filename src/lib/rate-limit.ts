import { NextRequest, NextResponse } from "next/server";
import { shouldTrustProxyHeaders } from "./env";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// Per-runtime-instance guard; it is not a distributed limit.
const buckets = new Map<string, RateLimitEntry>();

export function cleanupExpiredBuckets(now: number): number {
  let removed = 0;

  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
      removed += 1;
    }
  }

  return removed;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: number }
): { allowed: boolean; remaining: number; resetAt: number } {
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new RangeError("Rate limit must be a positive finite number.");
  }

  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new RangeError("Rate limit window must be a positive finite number.");
  }

  const now = options.now ?? Date.now();
  cleanupExpiredBuckets(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }

  if (existing.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: options.limit - existing.count, resetAt: existing.resetAt };
}

export function getClientIp(request: NextRequest): string {
  if (!shouldTrustProxyHeaders()) {
    return "unknown";
  }

  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)))
      }
    }
  );
}
