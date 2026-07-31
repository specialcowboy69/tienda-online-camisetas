import { NextResponse } from "next/server";
import { listCatalogProducts } from "@/lib/firestore";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await listCatalogProducts();
    return NextResponse.json({ products });
  } catch (error) {
    return jsonError(error);
  }
}
