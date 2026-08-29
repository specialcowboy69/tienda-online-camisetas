import { NextRequest, NextResponse } from "next/server";
import {
  beginWebhookEventProcessing,
  failWebhookEventProcessing,
  finishWebhookEventProcessing,
  findOrderByPrintfulExternalId,
  getOrder,
  markCatalogProductDeleted,
  saveCatalogProducts,
  updateOrderStatus
} from "@/lib/firestore";
import { env } from "@/lib/env";
import { sendShipmentEmail } from "@/lib/email";
import { fetchPrintfulCatalog } from "@/lib/printful";
import { jsonError, summarizeError } from "@/lib/http";

export const dynamic = "force-dynamic";

type PrintfulWebhookPayload = {
  type: string;
  created: number;
  retries: number;
  store: number;
  data?: {
    order?: {
      id?: number;
      external_id?: string;
      status?: string;
    };
    shipment?: {
      id?: number;
      carrier?: string;
      service?: string;
      tracking_number?: string;
      tracking_url?: string;
    };
    sync_product?: {
      id?: number;
      external_id?: string;
      name?: string;
    };
    product_id?: number;
    reason?: string;
  };
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PrintfulWebhookPayload;

    if (env.PRINTFUL_STORE_ID && String(payload.store) !== env.PRINTFUL_STORE_ID) {
      return NextResponse.json({ error: "Unexpected Printful store." }, { status: 403 });
    }

    const eventId = buildPrintfulEventId(payload);
    const shouldProcess = await beginWebhookEventProcessing("printful", eventId, payload);
    if (!shouldProcess) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    try {
      await applyPrintfulEvent(payload);
      await finishWebhookEventProcessing("printful", eventId);
      return NextResponse.json({ received: true });
    } catch (error) {
      await failWebhookEventProcessing("printful", eventId, summarizeError(error));
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}

async function applyPrintfulEvent(payload: PrintfulWebhookPayload): Promise<void> {
  const orderExternalId = payload.data?.order?.external_id;
  const orderId = orderExternalId ? await resolveOrderId(orderExternalId) : null;

  if (payload.type === "package_shipped" && orderId) {
    await updateOrderStatus(orderId, "shipped", {
      printfulOrderId: payload.data?.order?.id,
      printfulStatus: payload.data?.order?.status,
      tracking: {
        carrier: payload.data?.shipment?.carrier,
        service: payload.data?.shipment?.service,
        trackingNumber: String(payload.data?.shipment?.tracking_number || ""),
        trackingUrl: payload.data?.shipment?.tracking_url
      }
    });

    const order = await getOrder(orderId);
    if (order) {
      await sendShipmentEmail(order);
    }
  }

  if (payload.type === "package_returned" && orderId) {
    await updateOrderStatus(orderId, "returned", {
      printfulStatus: payload.data?.order?.status,
      error: {
        type: "PackageReturned",
        message: payload.data?.reason || "Printful marked the package as returned."
      }
    });
  }

  if (payload.type === "order_canceled" && orderId) {
    await updateOrderStatus(orderId, "canceled", {
      printfulStatus: payload.data?.order?.status,
      error: {
        type: "PrintfulOrderCanceled",
        message: payload.data?.reason || "Printful canceled the order."
      }
    });
  }

  if ((payload.type === "order_put_hold" || payload.type === "order_put_hold_approval") && orderId) {
    await updateOrderStatus(orderId, "manual_review", {
      printfulStatus: payload.data?.order?.status,
      error: {
        type: "PrintfulOrderHold",
        message: payload.data?.reason || "Printful put the order on hold."
      }
    });
  }

  if (payload.type === "order_remove_hold" && orderId) {
    await updateOrderStatus(orderId, "printful_confirmed", {
      printfulStatus: payload.data?.order?.status
    });
  }

  if (payload.type === "product_deleted" && payload.data?.sync_product?.id) {
    await markCatalogProductDeleted(payload.data.sync_product.id);
  }

  if (["product_synced", "product_updated", "stock_updated"].includes(payload.type)) {
    const products = await fetchPrintfulCatalog();
    await saveCatalogProducts(products);
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

  return `${payload.type}:${payload.created}:${payload.store}:${target}`;
}
