import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { addressesMateriallyMatch } from "./checkout-calculator";
import type { CheckoutValidationEvidence, StoreOrder } from "./types";

type CheckoutValidationFailureReason = "SessionMismatch" | "PaymentNotCompleted" | "PaymentMismatch" | "ShippingAddressMissing" | "ShippingAddressChanged";
export type PrintfulSubmissionEligibility = { allowed: true } | { allowed: false; reason: "CheckoutValidationRequired" | "CheckoutSnapshotChanged" | "OrderStatusBlocked" | "RefundReviewRequired"; message: string };
type CheckoutValidationResult = { valid: true; evidence: CheckoutValidationEvidence } | { valid: false; reason: CheckoutValidationFailureReason; message: string };

export class CheckoutValidationError extends Error {
  constructor(public readonly reason: CheckoutValidationFailureReason | Exclude<PrintfulSubmissionEligibility, { allowed: true }>["reason"], message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

function snapshotHash(order: StoreOrder): string {
  // Explicit immutable fields keep operational status, tracking, leases and refunds out of the proof.
  return createHash("sha256").update(JSON.stringify({
    id: order.id,
    recipient: {
      name: order.recipient.name, email: order.recipient.email, phone: order.recipient.phone ?? "",
      address1: order.recipient.address1, address2: order.recipient.address2 ?? "", city: order.recipient.city,
      stateCode: order.recipient.stateCode ?? "", countryCode: order.recipient.countryCode, zip: order.recipient.zip
    },
    items: order.items.map((item) => ({
      productId: item.productId, productName: item.productName, syncVariantId: item.syncVariantId,
      variantId: item.variantId, variantName: item.variantName, size: item.size ?? "", color: item.color ?? "",
      image: item.image ?? "", quantity: item.quantity, unitAmount: item.unitAmount, currency: item.currency
    })),
    shippingRate: {
      id: order.shippingRate.id, name: order.shippingRate.name, rate: order.shippingRate.rate, currency: order.shippingRate.currency,
      minDeliveryDays: order.shippingRate.minDeliveryDays ?? null, maxDeliveryDays: order.shippingRate.maxDeliveryDays ?? null,
      minDeliveryDate: order.shippingRate.minDeliveryDate ?? "", maxDeliveryDate: order.shippingRate.maxDeliveryDate ?? ""
    },
    totals: { subtotal: order.totals.subtotal, shipping: order.totals.shipping, total: order.totals.total, currency: order.totals.currency }
  })).digest("hex");
}

export function evaluatePaidCheckout(order: StoreOrder, session: Stripe.Checkout.Session, options: { source: CheckoutValidationEvidence["source"]; stripeTaxEnabled: boolean; validatedAt: string }): CheckoutValidationResult {
  const references = [session.metadata?.order_id, session.client_reference_id].filter((value) => value != null);
  if (!order.stripeSessionId || session.id !== order.stripeSessionId || !references.length || references.some((value) => value !== order.id)) {
    return { valid: false, reason: "SessionMismatch", message: "Stripe Checkout session or order references do not match the stored order." };
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid" || !paymentIntentId?.startsWith("pi_")) {
    return { valid: false, reason: "PaymentNotCompleted", message: "Stripe Checkout must be complete and paid with an identifiable PaymentIntent." };
  }
  const taxAmount = session.total_details?.amount_tax ?? 0;
  const currency = session.currency?.toLowerCase();
  if ((order.stripePaymentIntentId && order.stripePaymentIntentId !== paymentIntentId) || !Number.isSafeInteger(taxAmount) || taxAmount < 0 || !Number.isSafeInteger(session.amount_total) || session.amount_total !== order.totals.total + (options.stripeTaxEnabled ? taxAmount : 0) || currency !== order.totals.currency.toLowerCase()) {
    return { valid: false, reason: "PaymentMismatch", message: "Stripe paid amount, currency or PaymentIntent does not match the stored order snapshot." };
  }
  const address = session.shipping_details?.address;
  if (!address || ![address.line1, address.city, address.country, address.postal_code, order.recipient.address1, order.recipient.city, order.recipient.countryCode, order.recipient.zip].every((value) => value?.trim())) {
    return { valid: false, reason: "ShippingAddressMissing", message: "Stripe shipping address is missing required delivery fields." };
  }
  if (!addressesMateriallyMatch(order.recipient, address)) {
    return { valid: false, reason: "ShippingAddressChanged", message: "Stripe shipping address differs from the address used to quote Printful shipping." };
  }
  return { valid: true, evidence: {
    version: 1, validatedAt: options.validatedAt, source: options.source, stripeSessionId: session.id,
    stripePaymentIntentId: paymentIntentId, paidAmount: session.amount_total!, currency: currency!, taxAmount,
    stripeTaxEnabled: options.stripeTaxEnabled, orderSnapshotHash: snapshotHash(order)
  } };
}

export function hasValidCheckoutValidation(order: StoreOrder): boolean {
  const evidence = order.checkoutValidation;
  return Boolean(evidence && evidence.version === 1 && ["stripe_webhook", "admin_revalidation"].includes(evidence.source) && Number.isFinite(Date.parse(evidence.validatedAt)) &&
    evidence.stripeSessionId === order.stripeSessionId && evidence.stripePaymentIntentId?.startsWith("pi_") && evidence.stripePaymentIntentId === order.stripePaymentIntentId &&
    typeof evidence.stripeTaxEnabled === "boolean" && Number.isSafeInteger(evidence.taxAmount) && evidence.taxAmount >= 0 &&
    Number.isSafeInteger(evidence.paidAmount) && evidence.paidAmount === order.totals.total + (evidence.stripeTaxEnabled ? evidence.taxAmount : 0) &&
    evidence.currency === order.totals.currency.toLowerCase() && evidence.orderSnapshotHash === snapshotHash(order));
}

export function getPrintfulSubmissionEligibility(order: StoreOrder): PrintfulSubmissionEligibility {
  if (!order.checkoutValidation) {
    return { allowed: false, reason: "CheckoutValidationRequired", message: "Validate the paid Stripe Checkout session before retrying fulfillment." };
  }
  if (!hasValidCheckoutValidation(order)) {
    return { allowed: false, reason: "CheckoutSnapshotChanged", message: "The order no longer matches its checkout validation. Revalidation is required." };
  }
  const temporaryFailure = order.status === "failed" && order.error?.type === "PrintfulApiError" && (order.error.status === 429 || (order.error.status !== undefined && order.error.status >= 500));
  if (order.status !== "paid" && !temporaryFailure) {
    return { allowed: false, reason: "OrderStatusBlocked", message: "This order status requires review and cannot retry fulfillment." };
  }
  return { allowed: true };
}
