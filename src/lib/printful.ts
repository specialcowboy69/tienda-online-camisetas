import { env, getPrintfulWebhookTypes, requiredEnv, shouldConfirmPrintfulOrders } from "./env";
import { toMinorUnits } from "./money";
import { CatalogProduct, OrderItem, Recipient, ShippingRate, StoreOrder } from "./types";
import { readShippingRiskRates, type ShippingRiskPlacement, type ShippingRiskRate } from "./printful-shipping-risk";
import { z } from "zod";

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

  get isDuplicateExternalId(): boolean {
    if (this.status === 409) return true;
    const details = this.details as { error?: { code?: unknown; reason?: unknown }; code?: unknown; reason?: unknown } | null;
    return this.status === 400 && [details?.code, details?.reason, details?.error?.code, details?.error?.reason]
      .some((code) => code === "OR-13" || code === "EXTERNAL_ID_IN_USE");
  }
}

async function printfulFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${requiredEnv("PRINTFUL_API_TOKEN")}`);
  headers.set("Content-Type", "application/json");

  if (env.PRINTFUL_STORE_ID) {
    headers.set("X-PF-Store-Id", env.PRINTFUL_STORE_ID);
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  try {
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    const response = await fetch(`${PRINTFUL_API_BASE}${path}`, { ...init, headers, signal });
    const data = await response.json().catch((error: unknown) => {
      // Keep cancellation effective while consuming the body. An empty error
      // body can still establish HTTP404, but a successful malformed body cannot.
      if (signal.aborted || response.ok) throw error;
      return null;
    });
    if (!response.ok) {
      throw new PrintfulApiError(`Printful request failed: ${response.status}`, response.status, data);
    }
    return data as T;
  } finally {
    clearTimeout(deadline);
  }
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
      locale: "en_US"
    })
  });

  return data.result;
}

export async function getShippingRiskRates(recipient: Recipient, items: OrderItem[]): Promise<ShippingRiskRate[]> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  try {
    if (!items.length) throw new Error("Empty shipping risk cart.");
    const productIds = [...new Set(items.map(item => item.productId))];
    const details = new Map<string, PrintfulProductDetail>();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, productIds.length) }, async () => {
      while (next < productIds.length) {
        controller.signal.throwIfAborted();
        const id = productIds[next++];
        if (!/^\d+$/.test(id)) throw new Error("Invalid sync product identity.");
        const data = await printfulFetch<PrintfulResponse<PrintfulProductDetail>>(`/store/products/${id}`, { signal: controller.signal });
        if (String(data?.result?.sync_product?.id) !== id || !Array.isArray(data.result.sync_variants)) {
          throw new Error("Invalid sync product response.");
        }
        details.set(id, data.result);
      }
    }));
    const orderItems = items.map(item => {
      const variants = details.get(item.productId)!.sync_variants.filter(v => v.id === item.syncVariantId);
      const variant = variants[0];
      if (variants.length !== 1 || variant.variant_id !== item.variantId || variant.is_ignored) {
        throw new Error("Shipping risk variant identity mismatch.");
      }
      const files = variant.files?.filter(file => file.type !== "preview");
      if (!files || files.length !== 1 || files[0].type !== "front_dtf") {
        throw new Error("Unsupported shipping risk print configuration.");
      }
      const placements: ShippingRiskPlacement[] = [{ placement: "front_dtf", technique: "dtfilm" }];
      return { source: "catalog", catalog_variant_id: item.variantId, quantity: item.quantity, placements };
    });
    controller.signal.throwIfAborted();
    const data = await printfulFetch<unknown>("/v2/shipping-rates", {
      method: "POST", signal: controller.signal,
      body: JSON.stringify({ recipient: toPrintfulRecipient(recipient), order_items: orderItems, currency: items[0].currency.toUpperCase() })
    });
    return readShippingRiskRates(data);
  } finally {
    controller.abort();
    clearTimeout(deadline);
  }
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

  return readPrintfulOrder(data);
}

export function getPrintfulExternalId(order: Pick<StoreOrder, "id" | "printfulExternalId">): string {
  return order.printfulExternalId || order.id.replaceAll("-", "");
}

export async function findPrintfulOrderByExternalId(externalId: string): Promise<PrintfulOrder | null> {
  try {
    const data = await printfulFetch<PrintfulResponse<PrintfulOrder>>(`/orders/@${encodeURIComponent(externalId)}`);
    return readPrintfulOrder(data);
  } catch (error) {
    if (error instanceof PrintfulApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function readPrintfulOrder(data: PrintfulResponse<PrintfulOrder>): PrintfulOrder {
  const order = data?.result;
  if (!order || !Number.isSafeInteger(order.id) || order.id <= 0 || typeof order.status !== "string" || !order.status) {
    throw new PrintfulApiError("Printful returned an incomplete order response.", 502, null);
  }
  return order;
}

export function appendWebhookSecret(url: string, secret?: string): string {
  if (!secret) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("secret", secret);
  return parsed.toString();
}

const catalogIdSchema = z.number().int().positive().safe();
const stockProductSchema = z.object({
  sync_product: z.object({ id: catalogIdSchema, variants: catalogIdSchema, is_ignored: z.boolean().optional() }),
  sync_variants: z.array(z.object({
    is_ignored: z.boolean().optional(),
    variant_id: catalogIdSchema.optional(),
    product: z.object({ product_id: catalogIdSchema, variant_id: catalogIdSchema }).optional()
  })).min(1)
});
const webhookConfigSchema = z.object({
  url: z.string(),
  types: z.array(z.string().min(1)),
  // Printful serializes an empty PHP map as []; never accept nonempty arrays.
  params: z.union([z.record(z.unknown()), z.array(z.never()).length(0)]).optional()
});

async function resolveStockCatalogIds(syncProductIds: number[]): Promise<number[]> {
  if (!syncProductIds.length || syncProductIds.some(id => !catalogIdSchema.safeParse(id).success)) {
    throw new Error("A nonempty list of valid sync product IDs is required for stock registration.");
  }
  const pending = [...new Set(syncProductIds)];
  const catalogIds = new Set<number>();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  try {
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (pending.length) {
        controller.signal.throwIfAborted();
        const syncId = pending.shift()!;
        const response = await printfulFetch<PrintfulResponse<unknown>>(`/store/products/${syncId}`, { signal: controller.signal });
        const parsed = stockProductSchema.safeParse(response.result);
        if (!parsed.success || parsed.data.sync_product.id !== syncId || parsed.data.sync_product.is_ignored ||
            parsed.data.sync_product.variants !== parsed.data.sync_variants.length) {
          throw new Error("Cannot verify catalog product metadata for stock registration.");
        }
        const variants = parsed.data.sync_variants.filter(variant => !variant.is_ignored);
        if (!variants.length) throw new Error("No synced variants available for stock registration.");
        for (const variant of variants) {
          if (!variant.product || variant.product.variant_id !== variant.variant_id) {
            throw new Error("Cannot verify catalog variant identity for stock registration.");
          }
          catalogIds.add(variant.product.product_id);
        }
      }
    }));
    return [...catalogIds].sort((a, b) => a - b);
  } finally {
    controller.abort();
    clearTimeout(deadline);
  }
}

// Callers supply store sync IDs, never catalog IDs. Resolve them before any write.
export async function configurePrintfulWebhook(publicUrl: string, syncProductIds: number[] = []) {
  const productIds = await resolveStockCatalogIds(syncProductIds);
  const current = await printfulFetch<PrintfulResponse<unknown>>("/webhooks");
  const parsed = webhookConfigSchema.safeParse(current.result);
  if (!parsed.success) throw new Error("Cannot verify the existing Printful webhook configuration.");
  const existing = parsed.data;
  if (existing.url && existing.url !== publicUrl) {
    // Do not expose the authenticated URL or silently rotate its secret/destination.
    throw new Error("The existing Printful webhook destination differs. Review it before registering.");
  }
  const params = Array.isArray(existing.params) ? {} : (existing.params || {});
  const stock = z.record(z.unknown()).safeParse(params.stock_updated ?? {});
  if (!stock.success || params.stock_updated === null) throw new Error("Cannot verify the existing stock webhook parameters.");
  const types = existing.url ? [...existing.types] : getPrintfulWebhookTypes();
  if (!types.includes("stock_updated")) types.push("stock_updated");
  const previousIds = z.array(catalogIdSchema).safeParse(stock.data.product_ids);
  if (existing.url && existing.types.includes("stock_updated") && previousIds.success &&
      JSON.stringify([...previousIds.data].sort((a, b) => a - b)) === JSON.stringify(productIds)) return existing;

  const data = await printfulFetch<PrintfulResponse<unknown>>("/webhooks", {
    method: "POST",
    body: JSON.stringify({ url: existing.url || publicUrl, types, params: { ...params, stock_updated: { ...stock.data, product_ids: productIds } } })
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
