import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { listOrdersForReview } from "@/lib/firestore";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await listOrdersForReview();
    return NextResponse.json({ orders });
  } catch (error) {
    return jsonError(error);
  }
}
