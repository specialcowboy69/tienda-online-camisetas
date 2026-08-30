import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { env, getBaseUrl } from "@/lib/env";
import { listCatalogProducts } from "@/lib/firestore";
import { jsonError } from "@/lib/http";
import { appendWebhookSecret, configurePrintfulWebhook } from "@/lib/printful";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.PRINTFUL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "PRINTFUL_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  try {
    const url = `${getBaseUrl()}/api/webhooks/printful`;
    const registeredUrl = appendWebhookSecret(url, env.PRINTFUL_WEBHOOK_SECRET);
    const products = await listCatalogProducts();
    await configurePrintfulWebhook(
      registeredUrl,
      products.map((product) => product.syncProductId)
    );
    return NextResponse.json({ success: true, url });
  } catch (error) {
    return jsonError(error);
  }
}
