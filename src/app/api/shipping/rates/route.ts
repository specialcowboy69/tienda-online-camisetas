import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { quoteShipping } from "@/lib/order-service";
import { shippingRatesRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = shippingRatesRequestSchema.parse(await request.json());
    const rates = await quoteShipping(body);
    return NextResponse.json({ rates });
  } catch (error) {
    return jsonError(error);
  }
}
