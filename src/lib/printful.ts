import { env, getPrintfulWebhookTypes, requiredEnv, shouldConfirmPrintfulOrders } from "./env";
import { toMinorUnits } from "./money";
import { CatalogProduct, OrderItem, Recipient, ShippingRate, StoreOrder } from "./types";

const PRINTFUL_API_BASE = "https://api.printful.com";

type PrintfulResponse<T> = {
  code: number;
  result: T;
  paging?: {
    total: number;
    offset: number;
    limit: number;
  };
};

type PrintfulOrder = {
  id: number;
  status: string;
  external_id?: string;
};

type PrintfulSyncProductSummary = {
  id: number;
  external_id?: string;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url?: string;
  is_ignored?: boolean;
};

type PrintfulSyncVariant = {
  id: number;
  variant_id: number;
  name: string;
  retail_price?: string;
  currency?: string;
  size?: string;
  color?: string;
  options?: Array<{ id: string; value: string }>;
  files?: Array<{ type?: string; preview_url?: string; thumbnail_url?: string; url?: string }>;
  availability_status?: string;
  is_ignored?: boolean;
};

type PrintfulProductDetail = {
  sync_product: PrintfulSyncProductSummary;
  sync_variants: PrintfulSyncVariant[];
};

export class PrintfulApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "PrintfulApiError";
    this.status = status;
    this.details = details;
  }

  get isTemporary(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

async function printfulFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${requiredEnv("PRINTFUL_API_TOKEN")}`);
  headers.set("Content-Type", "application/json");

  if (env.PRINTFUL_STORE_ID) {
    headers.set("X-PF-Store-Id", env.PRINTFUL_STORE_ID);
  }

  const response = await fetch(`${PRINTFUL_API_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new PrintfulApiError(`Printful request failed: ${response.status}`, response.status, data);
  }

  return data as T;
}

export async function fetchPrintfulCatalog(): Promise<CatalogProduct[]> {
  const summaries: PrintfulSyncProductSummary[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await printfulFetch<PrintfulResponse<PrintfulSyncProductSummary[]>>(`/store/products?offset=${offset}&limit=${limit}`);
    summaries.push(...data.result);

    const total = data.paging?.total ?? summaries.length;
    offset += data.paging?.limit ?? limit;
    if (offset >= total) {
      break;
    }
  }

  const details = await Promise.all(
    summaries
      .filter((product) => !product.is_ignored && product.synced > 0)
      .map((product) => printfulFetch<PrintfulResponse<PrintfulProductDetail>>(`/store/products/${product.id}`).then((response) => response.result))
  );

  return details.map(mapPrintfulProduct);
}

function mapPrintfulProduct(detail: PrintfulProductDetail): CatalogProduct {
  const product = detail.sync_product;
  const now = new Date().toISOString();

  return {
    id: String(product.id),
    syncProductId: product.id,
    externalId: product.external_id,
    name: product.name,
    thumbnail: product.thumbnail_url,
    variants: detail.sync_variants
      .filter((variant) => !variant.is_ignored)
      .map((variant) => {
        const previewFile = variant.files?.find((file) => file.type === "preview") || variant.files?.[0];
        const size = variant.size || variant.options?.find((option) => option.id === "size")?.value;
        const color = variant.color || variant.options?.find((option) => option.id === "color")?.value;

        return {
          syncVariantId: variant.id,
          variantId: variant.variant_id,
          name: variant.name,
          size,
          color,
          retailPrice: variant.retail_price || "0.00",
          currency: (variant.currency || "EUR").toLowerCase(),
          image: previewFile?.preview_url || previewFile?.thumbnail_url || previewFile?.url || product.thumbnail_url,
          availabilityStatus: variant.availability_status,
          isIgnored: variant.is_ignored
        };
      }),
    isIgnored: product.is_ignored,
    synced: product.synced,
    updatedAt: now
  };
}

export async function getShippingRates(recipient: Recipient, items: OrderItem[]): Promise<ShippingRate[]> {
  const data = await printfulFetch<PrintfulResponse<ShippingRate[]>>("/shipping/rates", {
    method: "POST",
    body: JSON.stringify({
      recipient: toPrintfulRecipient(recipient),
      items: items.map((item) => ({
        variant_id: item.variantId,
        quantity: item.quantity,
        value: toPrintfulAmount(item.unitAmount, item.currency)
      })),
      currency: items[0]?.currency?.toUpperCase() || "EUR",
      locale: "es_ES"
    })
  });

  return data.result;
}

export async function createPrintfulOrder(order: StoreOrder): Promise<PrintfulOrder> {
  const confirm = shouldConfirmPrintfulOrders();
  const externalId = getPrintfulExternalId(order);
  const data = await printfulFetch<PrintfulResponse<PrintfulOrder>>(`/orders?confirm=${confirm ? "1" : "0"}`, {
    method: "POST",
    body: JSON.stringify({
      external_id: externalId,
      shipping: order.shippingRate.id,
      recipient: toPrintfulRecipient(order.recipient),
      retail_costs: {
        currency: order.totals.currency.toUpperCase(),
        subtotal: toPrintfulAmount(order.totals.subtotal, order.totals.currency),
        shipping: toPrintfulAmount(order.totals.shipping, order.totals.currency),
        total: toPrintfulAmount(order.totals.total, order.totals.currency)
      },
      items: order.items.map((item) => ({
        sync_variant_id: item.syncVariantId,
        quantity: item.quantity,
        retail_price: toPrintfulAmount(item.unitAmount, item.currency)
      }))
    })
  });

  return data.result;
}

export function getPrintfulExternalId(order: Pick<StoreOrder, "id" | "printfulExternalId">): string {
  return order.printfulExternalId || order.id.replaceAll("-", "");
}

export async function findPrintfulOrderByExternalId(externalId: string): Promise<PrintfulOrder | null> {
  try {
    const data = await printfulFetch<PrintfulResponse<PrintfulOrder>>(`/orders/@${encodeURIComponent(externalId)}`);
    return data.result;
  } catch (error) {
    if (error instanceof PrintfulApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function appendWebhookSecret(url: string, secret?: string): string {
  if (!secret) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("secret", secret);
  return parsed.toString();
}

export async function configurePrintfulWebhook(publicUrl: string, productIds: number[] = []) {
  const types = getPrintfulWebhookTypes().filter((type) => productIds.length > 0 || type !== "stock_updated");

  const params = productIds.length
    ? {
        stock_updated: {
          product_ids: productIds
        }
      }
    : undefined;

  const data = await printfulFetch<PrintfulResponse<unknown>>("/webhooks", {
    method: "POST",
    body: JSON.stringify({ url: publicUrl, types, params })
  });

  return data.result;
}

function toPrintfulRecipient(recipient: Recipient) {
  return {
    name: recipient.name,
    email: recipient.email,
    phone: recipient.phone,
    address1: recipient.address1,
    address2: recipient.address2,
    city: recipient.city,
    state_code: recipient.stateCode,
    country_code: recipient.countryCode,
    zip: recipient.zip
  };
}

function toPrintfulAmount(minorAmount: number, currency: string): string {
  return (toMinorUnits(1, currency) === 1 ? minorAmount : minorAmount / 100).toFixed(toMinorUnits(1, currency) === 1 ? 0 : 2);
}
