import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/auth";
import { createSyncRun, saveCatalogProducts } from "@/lib/firestore";
import { jsonError, summarizeError } from "@/lib/http";
import { fetchPrintfulCatalog } from "@/lib/printful";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return syncCatalog(request);
}

export async function POST(request: NextRequest) {
  return syncCatalog(request);
}

async function syncCatalog(request: NextRequest) {
  if (!isCronOrAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const products = await fetchPrintfulCatalog();
    await saveCatalogProducts(products);
    await createSyncRun({
      status: "success",
      productCount: products.length,
      variantCount: products.reduce((sum, product) => sum + product.variants.length, 0)
    });

    return NextResponse.json({ success: true, products: products.length });
  } catch (error) {
    await createSyncRun({ status: "failed", error: summarizeError(error) }).catch(() => undefined);
    return jsonError(error);
  }
}
