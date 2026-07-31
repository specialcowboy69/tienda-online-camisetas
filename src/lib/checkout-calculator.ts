import { randomUUID } from "crypto";
import { assertSameCurrency, toMinorUnits } from "./money";
import { CatalogProduct, CartItemInput, OrderItem, OrderTotals, Recipient, ShippingRate, StoreOrder } from "./types";

export function buildOrderItems(cartItems: CartItemInput[], products: CatalogProduct[]): OrderItem[] {
  return cartItems.map((cartItem) => {
    const product = products.find((candidate) => candidate.id === cartItem.productId);
    if (!product || product.isIgnored) {
      throw new Error(`Product ${cartItem.productId} is not available.`);
    }

    const variant = product.variants.find((candidate) => candidate.syncVariantId === cartItem.syncVariantId);
    if (!variant || variant.isIgnored || variant.availabilityStatus === "out_of_stock" || variant.availabilityStatus === "discontinued") {
      throw new Error(`Variant ${cartItem.syncVariantId} is not available.`);
    }

    return {
      productId: product.id,
      productName: product.name,
      syncVariantId: variant.syncVariantId,
      variantId: variant.variantId,
      variantName: variant.name,
      size: variant.size,
      color: variant.color,
      image: variant.image || product.thumbnail,
      quantity: cartItem.quantity,
      unitAmount: toMinorUnits(variant.retailPrice, variant.currency),
      currency: variant.currency
    };
  });
}

export function calculateTotals(items: OrderItem[], shippingRate: ShippingRate): OrderTotals {
  const currency = assertSameCurrency([...items.map((item) => item.currency), shippingRate.currency]);
  const subtotal = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
  const shipping = toMinorUnits(shippingRate.rate, currency);

  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    currency
  };
}

export function createDraftOrder(input: {
  recipient: Recipient;
  items: OrderItem[];
  shippingRate: ShippingRate;
  totals: OrderTotals;
}): StoreOrder {
  const now = new Date().toISOString();

  return {
    id: randomUUID().replaceAll("-", ""),
    status: "draft",
    recipient: input.recipient,
    items: input.items,
    shippingRate: input.shippingRate,
    totals: input.totals,
    createdAt: now,
    updatedAt: now
  };
}

export function addressesMateriallyMatch(saved: Recipient, stripeAddress?: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
} | null): boolean {
  if (!stripeAddress) {
    return true;
  }

  const normalize = (value?: string | null) => (value || "").trim().toLowerCase();

  return (
    normalize(saved.address1) === normalize(stripeAddress.line1) &&
    normalize(saved.city) === normalize(stripeAddress.city) &&
    normalize(saved.countryCode) === normalize(stripeAddress.country) &&
    normalize(saved.zip) === normalize(stripeAddress.postal_code)
  );
}
