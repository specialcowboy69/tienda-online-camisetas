import { NextRequest } from "next/server";
import { jsonError } from "@/lib/http";
import { handleStripeWebhook } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    return await handleStripeWebhook(rawBody, request.headers.get("stripe-signature"));
  } catch (error) {
    return jsonError(error, 500);
  }
}
