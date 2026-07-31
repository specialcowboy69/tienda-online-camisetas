import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getBaseUrl } from "@/lib/env";
import { listCatalogProducts } from "@/lib/firestore";
import { jsonError } from "@/lib/http";
import { configurePrintfulWebhook } from "@/lib/printful";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = `${getBaseUrl()}/api/webhooks/printful`;
    const products = await listCatalogProducts();
    const result = await configurePrintfulWebhook(
      url,
      products.map((product) => product.syncProductId)
    );
    return NextResponse.json({ success: true, url, result });
  } catch (error) {
    return jsonError(error);
  }
}
