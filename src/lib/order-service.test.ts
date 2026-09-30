import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { CatalogProduct, ShippingRate, StoreOrder } from "./types";

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getCatalogProduct: vi.fn(),
  getShippingRates: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  getOrder: vi.fn(), updateOrder: vi.fn(), updateOrderStatus: vi.fn(),
  createPrintfulOrder: vi.fn(), findPrintfulOrderByExternalId: vi.fn(),
  constructEvent: vi.fn(), retrieveSession: vi.fn(), createSession: vi.fn(),
  beginWebhookEventProcessing: vi.fn(), failWebhookEventProcessing: vi.fn(), finishWebhookEventProcessing: vi.fn()
}));

vi.mock("./firestore", () => ({
  beginWebhookEventProcessing: mocks.beginWebhookEventProcessing,
  createOrder: mocks.createOrder,
  failWebhookEventProcessing: mocks.failWebhookEventProcessing,
  finishWebhookEventProcessing: mocks.finishWebhookEventProcessing,
  findOrderByPrintfulExternalId: vi.fn(),
  findOrderByStripePaymentIntentId: vi.fn(),
  getCatalogProduct: mocks.getCatalogProduct,
  getOrder: mocks.getOrder,
  updateOrder: mocks.updateOrder,
  updateOrderStatus: mocks.updateOrderStatus
}));

vi.mock("./printful", () => ({
  PrintfulApiError: class PrintfulApiError extends Error {
    status = 500;
    details: unknown;

    get isTemporary() {
      return false;
    }
  },
  createPrintfulOrder: mocks.createPrintfulOrder,
  findPrintfulOrderByExternalId: mocks.findPrintfulOrderByExternalId,
  getPrintfulExternalId: vi.fn(),
  getShippingRates: mocks.getShippingRates
}));

vi.mock("./stripe", () => ({
  createStripeCheckoutSession: mocks.createStripeCheckoutSession,
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent }, checkout: { sessions: { retrieve: mocks.retrieveSession } } })
}));

vi.mock("./env", () => ({ isStripeTaxEnabled: () => false, requiredEnv: () => "synthetic-test-secret", getAllowedShippingCountries: () => ["US", "ES"], getBaseUrl: () => "http://localhost:3000" }));
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: mocks.createSession } };
} }));

const paidOrder: StoreOrder = {
  id: "order1", status: "paid", stripeSessionId: "cs_1",
  recipient: { name: "Ada", email: "ada@example.com", address1: "1 Main St", address2: "Apt 2", city: "Madrid", countryCode: "ES", zip: "28001" },
  items: [], shippingRate: { id: "STANDARD", name: "Standard", rate: "0", currency: "eur" },
  totals: { subtotal: 2000, shipping: 0, total: 2000, currency: "eur" }, createdAt: "2026-09-30", updatedAt: "2026-09-30"
};
const paidSession = {
  id: "cs_1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: "order1" }, client_reference_id: "order1",
  amount_total: 2000, currency: "eur", total_details: { amount_tax: 0 },
  shipping_details: { address: { line1: "1 Main St", line2: "Apt 2", city: "Madrid", country: "ES", postal_code: "28001" } }
} as unknown as Stripe.Checkout.Session;

vi.mock("./email", () => ({
  sendOrderConfirmationEmail: vi.fn()
}));

const product: CatalogProduct = {
  id: "101",
  syncProductId: 101,
  name: "Test Shirt",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [
    {
      syncVariantId: 201,
      variantId: 301,
      name: "Black / L",
      retailPrice: "25.50",
      currency: "eur",
      availabilityStatus: "active"
    }
  ]
};

const shippingRate: ShippingRate = {
  id: "STANDARD",
  name: "Standard",
  rate: "4.95",
  currency: "EUR"
};

describe("order service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "claimed", lease: { token: "event-owner", expiresAtMs: Date.now() + 120000 }, value: null });
    mocks.finishWebhookEventProcessing.mockResolvedValue(true);
    mocks.failWebhookEventProcessing.mockResolvedValue(true);
    mocks.getCatalogProduct.mockResolvedValue(product);
    mocks.getShippingRates.mockResolvedValue([shippingRate]);
    mocks.createStripeCheckoutSession.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test" });
    mocks.createPrintfulOrder.mockResolvedValue({ id: 123, status: "draft" });
  });

  it("leaves a busy Stripe event retryable without business writes", async () => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "busy", retryAfterSeconds: 17 });
    mocks.constructEvent.mockReturnValue({ id: "evt_busy", type: "checkout.session.expired", data: { object: paidSession } });
    await expect(handleStripeWebhook("{}", "signature")).rejects.toMatchObject({ retryAfterSeconds: 17 });
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.finishWebhookEventProcessing).not.toHaveBeenCalled();
  });

  it("acknowledges only completed Stripe duplicates", async () => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "processed" });
    mocks.constructEvent.mockReturnValue({ id: "evt_done", type: "checkout.session.expired", data: { object: paidSession } });
    const response = await handleStripeWebhook("{}", "signature");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("passes the owner token to Stripe completion and rejects lost ownership", async () => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.constructEvent.mockReturnValue({ id: "evt_other", type: "unhandled", data: { object: {} } });
    mocks.finishWebhookEventProcessing.mockResolvedValue(false);
    await expect(handleStripeWebhook("{}", "signature")).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
    expect(mocks.finishWebhookEventProcessing).toHaveBeenCalledWith("stripe", "evt_other", "event-owner");
    expect(mocks.failWebhookEventProcessing).toHaveBeenCalledWith("stripe", "evt_other", "event-owner", expect.anything());
  });

  it("reports lost ownership when a Stripe failure cannot be recorded", async () => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.constructEvent.mockReturnValue({ id: "evt_failed", type: "checkout.session.completed", data: { object: paidSession } });
    mocks.getOrder.mockRejectedValueOnce(new Error("processing failed"));
    mocks.failWebhookEventProcessing.mockResolvedValue(false);
    await expect(handleStripeWebhook("{}", "signature")).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
  });

  it("blocks unsafe fulfillment retries before any writes or provider calls", async () => {
    const { submitOrderToPrintful } = await import("./order-service");
    mocks.getOrder.mockResolvedValue({ ...paidOrder, status: "failed", error: { type: "StripeAsyncPaymentFailed", message: "Unpaid" } });
    await expect(submitOrderToPrintful("order1")).rejects.toMatchObject({ reason: "CheckoutValidationRequired" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(mocks.findPrintfulOrderByExternalId).not.toHaveBeenCalled();
  });

  it("puts the order identity on the PaymentIntent for later refund correlation", async () => {
    const stripeBoundary = await vi.importActual<typeof import("./stripe")>("./stripe");
    await stripeBoundary.createStripeCheckoutSession(paidOrder);
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ payment_intent_data: { metadata: { order_id: "order1" } } }));
  });

  it("keeps existing fulfillment idempotent without creating another order", async () => {
    const { submitOrderToPrintful } = await import("./order-service");
    const existing = { ...paidOrder, status: "printful_confirmed" as const, printfulOrderId: 123 };
    mocks.getOrder.mockResolvedValue(existing);
    await expect(submitOrderToPrintful("order1")).resolves.toEqual(existing);
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
  });

  it.each(["manual_review", "canceled", "refunded", "expired"] as const)("does not reopen %s on a repeated paid event", async (status) => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.getOrder.mockResolvedValue({ ...paidOrder, status });
    mocks.constructEvent.mockReturnValue({ id: "evt_repeat", type: "checkout.session.completed", data: { object: paidSession } });
    await handleStripeWebhook("{}", "synthetic-signature");
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it.each([null, { ...paidSession.shipping_details, address: { ...paidSession.shipping_details!.address, line2: "Apt 3" } }])("preserves paid correlation when shipping needs review %#", async (shipping_details) => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.getOrder.mockResolvedValue(paidOrder);
    mocks.constructEvent.mockReturnValue({ id: "evt_1", type: "checkout.session.completed", data: { object: { ...paidSession, shipping_details } } });
    await handleStripeWebhook("{}", "synthetic-signature");
    expect(mocks.updateOrderStatus).toHaveBeenCalledWith("order1", "manual_review", expect.objectContaining({ stripePaymentIntentId: "pi_1", stripeAmountTotal: 2000, stripeTaxAmount: 0 }));
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it("revalidation leaves a failed checkout untouched", async () => {
    const service = await import("./order-service");
    mocks.getOrder.mockResolvedValue(paidOrder);
    mocks.retrieveSession.mockResolvedValue({ ...paidSession, amount_total: 1 });
    await expect(service.revalidatePaidCheckout("order1")).rejects.toMatchObject({ reason: "PaymentMismatch" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it("revalidation refreshes evidence but preserves manual review and never fulfills", async () => {
    const service = await import("./order-service");
    const review = { ...paidOrder, status: "manual_review" as const, error: { type: "ShippingAddressChanged", message: "Review required" } };
    mocks.getOrder.mockResolvedValue(review);
    mocks.retrieveSession.mockResolvedValue(paidSession);
    const result = await service.revalidatePaidCheckout("order1");
    expect(result).toMatchObject({ status: "manual_review", error: review.error, checkoutValidation: { source: "admin_revalidation" } });
    expect(mocks.retrieveSession).toHaveBeenCalledWith("cs_1");
    expect(mocks.updateOrder.mock.calls[0][1]).not.toHaveProperty("status");
    expect(mocks.updateOrder.mock.calls[0][1]).not.toHaveProperty("error");
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it("creates United States checkouts with a Printful shipping method but no customer shipping charge", async () => {
    const { createCheckout } = await import("./order-service");

    const result = await createCheckout({
      recipient: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        address1: "1 Test Street",
        city: "New York",
        stateCode: "NY",
        countryCode: "US",
        zip: "10001"
      },
      items: [{ productId: "101", syncVariantId: 201, quantity: 1 }],
      shippingRateId: "STANDARD"
    });

    expect(result.order.shippingRate).toMatchObject({ id: "STANDARD", rate: "0.00" });
    expect(result.order.totals).toMatchObject({
      subtotal: 2550,
      shipping: 0,
      total: 2550,
      currency: "eur"
    });
    expect(mocks.createOrder.mock.calls[0][0].totals.shipping).toBe(0);
    expect(mocks.createStripeCheckoutSession.mock.calls[0][0].totals.shipping).toBe(0);
  });
});
