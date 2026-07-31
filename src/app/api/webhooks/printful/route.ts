import { NextRequest, NextResponse } from "next/server";
import {
  beginWebhookEventProcessing,
  failWebhookEventProcessing,
  finishWebhookEventProcessing,
  markCatalogProductDeleted,
  saveCatalogProducts,
  updateOrderStatus
} from "@/lib/firestore";
import { env } from "@/lib/env";
import { sendShipmentEmail } from "@/lib/email";
import { getOrder } from "@/lib/firestore";
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

  if (payload.type === "package_shipped" && orderExternalId) {
    await updateOrderStatus(orderExternalId, "shipped", {
      printfulOrderId: payload.data?.order?.id,
      printfulStatus: payload.data?.order?.status,
      tracking: {
        carrier: payload.data?.shipment?.carrier,
        service: payload.data?.shipment?.service,
        trackingNumber: String(payload.data?.shipment?.tracking_number || ""),
        trackingUrl: payload.data?.shipment?.tracking_url
      }
    });

    const order = await getOrder(orderExternalId);
    if (order) {
      await sendShipmentEmail(order);
    }
  }

  if (payload.type === "package_returned" && orderExternalId) {
    await updateOrderStatus(orderExternalId, "returned", {
      printfulStatus: payload.data?.order?.status,
      error: {
        type: "PackageReturned",
        message: payload.data?.reason || "Printful marked the package as returned."
      }
    });
  }

  if (payload.type === "order_canceled" && orderExternalId) {
    await updateOrderStatus(orderExternalId, "canceled", {
      printfulStatus: payload.data?.order?.status,
      error: {
        type: "PrintfulOrderCanceled",
        message: payload.data?.reason || "Printful canceled the order."
      }
    });
  }

  if ((payload.type === "order_put_hold" || payload.type === "order_put_hold_approval") && orderExternalId) {
    await updateOrderStatus(orderExternalId, "manual_review", {
      printfulStatus: payload.data?.order?.status,
      error: {
        type: "PrintfulOrderHold",
        message: payload.data?.reason || "Printful put the order on hold."
      }
    });
  }

  if (payload.type === "order_remove_hold" && orderExternalId) {
    await updateOrderStatus(orderExternalId, "printful_confirmed", {
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
