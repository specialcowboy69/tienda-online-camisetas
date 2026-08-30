import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { quoteShipping } from "@/lib/order-service";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { shippingRatesRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`shipping:${getClientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.allowed) {
    return rateLimitResponse(limited.resetAt);
  }

  try {
    const body = shippingRatesRequestSchema.parse(await request.json());
    const rates = await quoteShipping(body);
    return NextResponse.json({ rates });
  } catch (error) {
    return jsonError(error);
  }
}
