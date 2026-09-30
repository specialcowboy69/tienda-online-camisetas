import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { listOrdersForReview } from "@/lib/firestore";
import { jsonError } from "@/lib/http";
import { getPrintfulSubmissionEligibility, hasValidCheckoutValidation } from "@/lib/checkout-validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await listOrdersForReview();
    return NextResponse.json({ orders: orders.map((order) => ({
      ...order,
      checkoutValidationStatus: !order.checkoutValidation ? "missing" : hasValidCheckoutValidation(order) ? "valid" : "invalid",
      printfulSubmissionEligibility: getPrintfulSubmissionEligibility(order)
    })) });
  } catch (error) {
    return jsonError(error);
  }
}
