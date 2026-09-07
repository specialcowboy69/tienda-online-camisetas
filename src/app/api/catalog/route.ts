import { NextResponse } from "next/server";
import { applyStoreCurrencyToProducts } from "@/lib/catalog-pricing";
import { getStoreCurrency } from "@/lib/env";
import { listCatalogProducts } from "@/lib/firestore";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = applyStoreCurrencyToProducts(await listCatalogProducts(), getStoreCurrency());
    return NextResponse.json({ products });
  } catch (error) {
    return jsonError(error);
  }
}
