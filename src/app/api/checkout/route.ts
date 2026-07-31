import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { createCheckout } from "@/lib/order-service";
import { checkoutRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
