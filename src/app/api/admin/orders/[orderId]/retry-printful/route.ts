import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { submitOrderToPrintful } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { orderId } = await context.params;
    const order = await submitOrderToPrintful(orderId);
    return NextResponse.json({ order });
  } catch (error) {
    return jsonError(error);
  }
}
