import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { CheckoutValidationError } from "@/lib/checkout-validation";
import { jsonError } from "@/lib/http";
import { revalidatePaidCheckout } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { orderId } = await context.params;
    const order = await revalidatePaidCheckout(orderId);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: 409 });
    }
    return jsonError(error);
  }
}
