import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  beginWebhookEventProcessing,
  failWebhookEventProcessing,
  finishWebhookEventProcessing,
  findOrderByPrintfulExternalId,
  getOrder,
  markCatalogProductDeleted,
  saveCatalogProducts,
  applyClaimedShipment, claimOrderProcessing, listOrderEmailJobs, releaseOrderProcessing, updateClaimedOrder
} from "@/lib/firestore";
import { env } from "@/lib/env";
import { buildEmailJob, processEmailJob, requireEmailRecovery } from "@/lib/email-jobs";
import { fetchPrintfulCatalog } from "@/lib/printful";
import { isPrintfulWebhookSecretValid, parsePrintfulWebhookPayload, shipmentIdentity, type PrintfulWebhookPayload } from "@/lib/printful-webhook";
import type { StoreOrder } from "@/lib/types";
import { jsonError, summarizeError } from "@/lib/http";
import { ProcessingBusyError, ProcessingOwnershipLostError, processingErrorResponse } from "@/lib/processing-errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get("x-printful-webhook-secret") || request.nextUrl.searchParams.get("secret");
  if (!isPrintfulWebhookSecretValid(suppliedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = parsePrintfulWebhookPayload(await request.json());

    if (env.PRINTFUL_STORE_ID && String(payload.store) !== env.PRINTFUL_STORE_ID) {
      return NextResponse.json({ error: "Unexpected Printful store." }, { status: 403 });
    }

    const eventId = buildPrintfulEventId(payload);
    const claim = await beginWebhookEventProcessing("printful", eventId, payload);
    if (claim.kind === "processed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);

    try {
      await applyPrintfulEvent(payload);
      if (!await finishWebhookEventProcessing("printful", eventId, claim.lease.token)) throw new ProcessingOwnershipLostError();
      return NextResponse.json({ received: true });
    } catch (error) {
      if (!await failWebhookEventProcessing("printful", eventId, claim.lease.token, summarizeError(error))) throw new ProcessingOwnershipLostError();
      throw error;
    }
  } catch (error) {
    return processingErrorResponse(error) || jsonError(error);
  }
}

async function applyPrintfulEvent(payload: PrintfulWebhookPayload): Promise<void> {
  const orderExternalId = payload.data?.order?.external_id;
  const orderId = orderExternalId ? await resolveOrderId(orderExternalId) : null;

  if (orderId && ["package_shipped", "package_returned", "order_canceled", "order_put_hold", "order_put_hold_approval", "order_remove_hold"].includes(payload.type)) await applyOrderEvent(orderId, payload);

  if (payload.type === "product_deleted" && payload.data?.sync_product?.id) {
    await markCatalogProductDeleted(payload.data.sync_product.id);
  }

  if (["product_synced", "product_updated", "stock_updated"].includes(payload.type)) {
    const products = await fetchPrintfulCatalog();
    await saveCatalogProducts(products);
  }
}

async function applyOrderEvent(orderId: string, payload: PrintfulWebhookPayload): Promise<void> {
  const claim = await claimOrderProcessing(orderId);
  if (claim.kind === "missing") throw new Error("Printful order association is missing.");
  if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);
  const token = claim.lease.token;
  const write = async (patch: Partial<StoreOrder>) => {
    if (!await updateClaimedOrder(orderId, token, patch)) throw new ProcessingOwnershipLostError();
  };
  try {
    const order = await getOrder(orderId);
    if (!order) throw new Error("Printful order association is missing.");
    if (order.printfulOrderId && payload.data?.order?.id && order.printfulOrderId !== payload.data.order.id) {
      await write({ emailReviewReason: "Printful event identity conflicts with the recorded order. Manual review required." }); return;
    }
    if (payload.type === "package_shipped") {
      // Ownership prevents concurrent writers; it does not make a delayed event newer.
      if (!["printful_confirmed", "shipped", "printful_pending"].includes(order.status)) return;
      const identity = shipmentIdentity(payload);
      if (!identity) { await write({ emailReviewReason: "Shipment identity is missing. Manual review required; no email was created." }); return; }
      const patch: Partial<StoreOrder> = {
        status: "shipped", ...(payload.data?.order?.id ? { printfulOrderId: payload.data.order.id } : {}),
        ...(payload.data?.order?.status ? { printfulStatus: payload.data.order.status } : {}),
        tracking: Object.fromEntries(Object.entries({ carrier: payload.data?.shipment?.carrier, service: payload.data?.shipment?.service, trackingNumber: payload.data?.shipment?.tracking_number, trackingUrl: payload.data?.shipment?.tracking_url }).filter(([, value]) => value !== undefined))
      };
      const candidate = buildEmailJob({ ...order, ...patch }, "shipment", identity);
      const existing = (await listOrderEmailJobs(orderId)).find((job) => job.id === candidate.id);
      const job = existing || (order.emailPolicyVersion === 1 ? candidate : undefined);
      if (!job) patch.emailReviewReason = "Legacy fulfilled order has no durable shipment email record. Manual review required; no historical email was created.";
      // A replay of an already recorded shipment must not overwrite newer tracking.
      if (!await applyClaimedShipment(orderId, token, existing ? {} : patch, job)) throw new ProcessingOwnershipLostError();
      if (job) requireEmailRecovery([{ result: await processEmailJob(job.id) }]);
      return;
    }
    const printfulStatus = payload.data?.order?.status;
    const patch: Partial<StoreOrder> = printfulStatus ? { printfulStatus } : {};
    if (payload.type === "package_returned") {
      if (["canceled", "refunded", "expired"].includes(order.status)) return;
      await write({ ...patch, status: "returned", error: { type: "PackageReturned", message: "Printful marked the package as returned." } });
    } else if (payload.type === "order_canceled") {
      if (["returned", "refunded", "expired"].includes(order.status)) return;
      await write({ ...patch, status: "canceled", error: { type: "PrintfulOrderCanceled", message: "Printful canceled the order." } });
    } else if (payload.type === "order_remove_hold") {
      if (order.status !== "manual_review" || order.error?.type !== "PrintfulOrderHold") return;
      await write({ ...patch, status: "printful_confirmed" });
    } else if (!["shipped", "returned", "canceled", "refunded", "expired"].includes(order.status)) {
      await write({ ...patch, status: "manual_review", error: { type: "PrintfulOrderHold", message: "Printful put the order on hold." } });
    }
  } finally {
    if (!await releaseOrderProcessing(orderId, token)) throw new ProcessingOwnershipLostError();
  }
}

async function resolveOrderId(printfulExternalId: string): Promise<string | null> {
  const order = (await getOrder(printfulExternalId)) || (await findOrderByPrintfulExternalId(printfulExternalId));
  return order?.id || null;
}

function buildPrintfulEventId(payload: PrintfulWebhookPayload): string {
  const data = payload.data || {};
  const target =
    data.order?.external_id ||
    data.order?.id ||
    data.shipment?.id ||
    data.sync_product?.id ||
    data.product_id ||
    "unknown";

  const shipment = payload.type.startsWith("package_") ? `:${shipmentIdentity(payload) || `review:${createHash("sha256").update(JSON.stringify(data)).digest("hex")}`}` : "";
  return `${payload.type}:${payload.created}:${payload.store}:${target}${shipment}`;
}
