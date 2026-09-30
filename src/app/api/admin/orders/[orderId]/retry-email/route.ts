import { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getOrder } from "@/lib/firestore";
import { retryOrderEmails } from "@/lib/email-jobs";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  if (!isAdminRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    if (!await getOrder(orderId)) return Response.json({ error: "Order not found." }, { status: 404 });
    const results = await retryOrderEmails(orderId);
    const retryable = results.some(({ result }) => result === "retry" || result === "busy");
    return Response.json({ results }, retryable ? { status: 503, headers: { "Retry-After": "1" } } : {});
  } catch (error) { return jsonError(error); }
}
