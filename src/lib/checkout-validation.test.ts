import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { evaluatePaidCheckout, getPrintfulSubmissionEligibility, hasValidCheckoutValidation } from "./checkout-validation";
import type { StoreOrder } from "./types";

const order: StoreOrder = {
  id: "order1", status: "paid", stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1",
  recipient: { name: "Ada", email: "ada@example.com", address1: "1 Main St", address2: "Apt 2", city: "New York", stateCode: "NY", countryCode: "US", zip: "10001" },
  items: [{ productId: "p1", productName: "Shirt", syncVariantId: 1, variantId: 2, variantName: "M", quantity: 1, unitAmount: 2000, currency: "usd" }],
  shippingRate: { id: "STANDARD", name: "Standard", rate: "0.00", currency: "usd" },
  totals: { subtotal: 2000, shipping: 0, total: 2000, currency: "usd" }, createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z"
};
const session = {
  id: "cs_1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1",
  client_reference_id: "order1", metadata: { order_id: "order1" }, amount_total: 2000, currency: "USD", total_details: { amount_tax: 0 },
  shipping_details: { address: { line1: "1 Main St", line2: "Apt 2", city: "New York", state: "NY", country: "US", postal_code: "10001" } }
} as unknown as Stripe.Checkout.Session;
const options = { source: "stripe_webhook" as const, stripeTaxEnabled: false, validatedAt: "2026-09-30T00:00:00Z" };

function validatedOrder(): StoreOrder {
  const result = evaluatePaidCheckout(order, session, options);
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error("Expected valid checkout");
  return { ...structuredClone(order), checkoutValidation: result.evidence };
}

describe("paid checkout validation", () => {
  it("records versioned payment evidence for the immutable snapshot", () => {
    const result = evaluatePaidCheckout(order, session, options);
    expect(result).toMatchObject({ valid: true, evidence: { version: 1, source: "stripe_webhook", stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1", paidAmount: 2000, currency: "usd", taxAmount: 0, stripeTaxEnabled: false } });
  });
  it.each([
    ["wrong session", { id: "cs_other" }, "SessionMismatch"],
    ["wrong reference", { client_reference_id: "other" }, "SessionMismatch"],
    ["wrong metadata", { metadata: { order_id: "other" } }, "SessionMismatch"],
    ["missing references", { client_reference_id: null, metadata: {} }, "SessionMismatch"],
    ["unpaid", { payment_status: "unpaid" }, "PaymentNotCompleted"],
    ["open", { status: "open" }, "PaymentNotCompleted"],
    ["subscription", { mode: "subscription" }, "PaymentNotCompleted"],
    ["missing payment intent", { payment_intent: null }, "PaymentNotCompleted"],
    ["wrong payment intent", { payment_intent: "pi_other" }, "PaymentMismatch"],
    ["wrong amount", { amount_total: 1999 }, "PaymentMismatch"],
    ["wrong currency", { currency: "eur" }, "PaymentMismatch"],
    ["missing shipping", { shipping_details: null }, "ShippingAddressMissing"],
    ["changed shipping", { shipping_details: { address: { ...session.shipping_details!.address, line2: "Apt 3" } } }, "ShippingAddressChanged"]
  ])("rejects %s", (_name, patch, reason) => {
    expect(evaluatePaidCheckout(order, { ...session, ...patch } as Stripe.Checkout.Session, options)).toMatchObject({ valid: false, reason });
  });
  it("requires a persisted session identity", () => {
    expect(evaluatePaidCheckout({ ...order, stripeSessionId: undefined }, session, options)).toMatchObject({ valid: false, reason: "SessionMismatch" });
  });
  it("requires required address fields even when both snapshots are empty", () => {
    expect(evaluatePaidCheckout({ ...order, recipient: { ...order.recipient, city: "" } }, { ...session, shipping_details: { ...session.shipping_details, address: { ...session.shipping_details!.address, city: "" } } } as Stripe.Checkout.Session, options)).toMatchObject({ valid: false, reason: "ShippingAddressMissing" });
  });
  it("checks tax-inclusive amounts only when Stripe Tax is enabled", () => {
    const taxed = { ...session, amount_total: 2200, total_details: { amount_tax: 200 } } as Stripe.Checkout.Session;
    expect(evaluatePaidCheckout(order, taxed, { ...options, stripeTaxEnabled: true })).toMatchObject({ valid: true, evidence: { paidAmount: 2200, taxAmount: 200 } });
    expect(evaluatePaidCheckout(order, taxed, options)).toMatchObject({ valid: false, reason: "PaymentMismatch" });
  });
  it("accepts an expanded identifiable PaymentIntent", () => {
    expect(evaluatePaidCheckout(order, { ...session, payment_intent: { id: "pi_1" } } as Stripe.Checkout.Session, options).valid).toBe(true);
  });
  it.each([
    (value: StoreOrder) => { value.recipient.address2 = "Apt 3"; },
    (value: StoreOrder) => { value.items[0].quantity = 2; },
    (value: StoreOrder) => { value.items[0].unitAmount = 1; },
    (value: StoreOrder) => { value.shippingRate.id = "EXPRESS"; },
    (value: StoreOrder) => { value.totals.total = 1; },
    (value: StoreOrder) => { value.id = "other"; },
    (value: StoreOrder) => { value.stripeSessionId = "other"; },
    (value: StoreOrder) => { value.stripePaymentIntentId = "other"; }
  ])("invalidates evidence after a snapshot/payment identity mutation %#", (mutate) => {
    const value = validatedOrder();
    expect(hasValidCheckoutValidation(value)).toBe(true);
    mutate(value);
    expect(hasValidCheckoutValidation(value)).toBe(false);
  });
  it("does not invalidate evidence after operational status/tracking/error updates", () => {
    const value = validatedOrder();
    value.status = "failed"; value.tracking = { carrier: "Carrier" }; value.error = { type: "PrintfulApiError", status: 500, message: "Temporary" };
    expect(hasValidCheckoutValidation(value)).toBe(true);
  });
  it("blocks orders without evidence", () => {
    expect(getPrintfulSubmissionEligibility(order)).toMatchObject({ allowed: false, reason: "CheckoutValidationRequired" });
  });
  it.each(["draft", "checkout_created", "expired", "canceled", "refunded", "manual_review", "printful_pending", "printful_confirmed", "shipped", "returned"] as const)("blocks status %s even with payment evidence", (status) => {
    expect(getPrintfulSubmissionEligibility({ ...validatedOrder(), status })).toMatchObject({ allowed: false, reason: "OrderStatusBlocked" });
  });
  it.each([429, 500, 503])("allows a validated temporary Printful %i failure", (status) => {
    expect(getPrintfulSubmissionEligibility({ ...validatedOrder(), status: "failed", error: { type: "PrintfulApiError", status, message: "Temporary" } })).toEqual({ allowed: true });
  });
  it("allows paid evidence but blocks permanent and payment failures", () => {
    const value = validatedOrder();
    expect(getPrintfulSubmissionEligibility(value)).toEqual({ allowed: true });
    for (const error of [{ type: "PrintfulApiError", status: 400, message: "Bad address" }, { type: "StripeAsyncPaymentFailed", message: "Failed" }]) {
      expect(getPrintfulSubmissionEligibility({ ...value, status: "failed", error })).toMatchObject({ allowed: false, reason: "OrderStatusBlocked" });
    }
    value.recipient.address1 = "Changed";
    expect(getPrintfulSubmissionEligibility(value)).toMatchObject({ allowed: false, reason: "CheckoutSnapshotChanged" });
  });
});
