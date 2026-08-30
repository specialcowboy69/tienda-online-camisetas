import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { createCheckout } from "@/lib/order-service";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkoutRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`checkout:${getClientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.allowed) {
    return rateLimitResponse(limited.resetAt);
  }

  try {
    const body = checkoutRequestSchema.parse(await request.json());
    const result = await createCheckout(body);

    return NextResponse.json({
      orderId: result.order.id,
      checkoutUrl: result.checkoutUrl
    });
  } catch (error) {
    return jsonError(error);
  }
}
