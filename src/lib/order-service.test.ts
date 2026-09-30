import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { CatalogProduct, ShippingRate, StoreOrder } from "./types";
import { evaluatePaidCheckout } from "./checkout-validation";

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getCatalogProduct: vi.fn(),
  getShippingRates: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  getOrder: vi.fn(), updateOrder: vi.fn(), updateOrderStatus: vi.fn(),
  createPrintfulOrder: vi.fn(), findPrintfulOrderByExternalId: vi.fn(),
  constructEvent: vi.fn(), retrieveSession: vi.fn(), createSession: vi.fn(),
  beginWebhookEventProcessing: vi.fn(), failWebhookEventProcessing: vi.fn(), finishWebhookEventProcessing: vi.fn(),
  claimOrderProcessing: vi.fn(), renewOrderProcessing: vi.fn(), updateClaimedOrder: vi.fn(), releaseOrderProcessing: vi.fn(), sendEmail: vi.fn()
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
  updateOrderStatus: mocks.updateOrderStatus,
  claimOrderProcessing: mocks.claimOrderProcessing, renewOrderProcessing: mocks.renewOrderProcessing,
  updateClaimedOrder: mocks.updateClaimedOrder, releaseOrderProcessing: mocks.releaseOrderProcessing
}));

vi.mock("./printful", () => ({
  PrintfulApiError: class PrintfulApiError extends Error {
    constructor(message: string, public status: number, public details: unknown) { super(message); this.name = "PrintfulApiError"; }

    get isTemporary() {
      return this.status >= 500 || this.status === 429;
    }
    get isDuplicateExternalId() { return this.status === 409 || JSON.stringify(this.details).includes("OR-13"); }
  },
  createPrintfulOrder: mocks.createPrintfulOrder,
  findPrintfulOrderByExternalId: mocks.findPrintfulOrderByExternalId,
  getPrintfulExternalId: (order: StoreOrder) => order.printfulExternalId || order.id.replaceAll("-", ""),
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
  sendOrderConfirmationEmail: mocks.sendEmail
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

function validatedOrder(): StoreOrder {
  const result = evaluatePaidCheckout(paidOrder, paidSession, { source: "stripe_webhook", stripeTaxEnabled: false, validatedAt: "2026-09-30T12:00:00Z" });
  if (!result.valid) throw new Error("Invalid fixture");
  return { ...paidOrder, stripePaymentIntentId: "pi_1", checkoutValidation: result.evidence };
}

function ownedStore(initial: StoreOrder) {
  let current = initial;
  let owner: string | null = null;
  mocks.getOrder.mockImplementation(async () => current);
  mocks.updateOrder.mockImplementation(async (_id, patch) => { current = { ...current, ...patch }; });
  mocks.updateOrderStatus.mockImplementation(async (_id, status, patch) => { current = { ...current, ...patch, status }; });
  mocks.claimOrderProcessing.mockImplementation(async () => {
    if (owner) return { kind: "busy", retryAfterSeconds: 120 };
    owner = "order-owner";
    return { kind: "claimed", lease: { token: owner, expiresAtMs: Date.now() + 120000 }, value: current };
  });
  mocks.updateClaimedOrder.mockImplementation(async (_id, token, patch) => {
    if (owner !== token) return false;
    current = { ...current, ...patch };
    return true;
  });
  mocks.renewOrderProcessing.mockImplementation(async (_id, token) => owner === token);
  mocks.releaseOrderProcessing.mockImplementation(async (_id, token) => { if (owner !== token) return false; owner = null; return true; });
  return { read: () => current, replace: (order: StoreOrder) => { current = order; owner = "new-owner"; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("order service", () => {
  afterEach(() => { vi.useRealTimers(); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "claimed", lease: { token: "event-owner", expiresAtMs: Date.now() + 120000 }, value: null });
    mocks.finishWebhookEventProcessing.mockResolvedValue(true);
    mocks.failWebhookEventProcessing.mockResolvedValue(true);
    mocks.getCatalogProduct.mockResolvedValue(product);
    mocks.getShippingRates.mockResolvedValue([shippingRate]);
    mocks.createStripeCheckoutSession.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test" });
    mocks.createPrintfulOrder.mockResolvedValue({ id: 123, status: "draft", external_id: "order1" });
    mocks.findPrintfulOrderByExternalId.mockResolvedValue(null);
    mocks.claimOrderProcessing.mockImplementation(async () => ({ kind: "claimed", lease: { token: "order-owner", expiresAtMs: Date.now() + 120000 }, value: await mocks.getOrder() }));
    mocks.renewOrderProcessing.mockResolvedValue(true);
    mocks.updateClaimedOrder.mockResolvedValue(true);
    mocks.releaseOrderProcessing.mockResolvedValue(true);
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
    expect(mocks.updateClaimedOrder).not.toHaveBeenCalled();
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
    expect(mocks.updateClaimedOrder).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it.each([null, { ...paidSession.shipping_details, address: { ...paidSession.shipping_details!.address, line2: "Apt 3" } }])("preserves paid correlation when shipping needs review %#", async (shipping_details) => {
    const { handleStripeWebhook } = await import("./order-service");
    mocks.getOrder.mockResolvedValue(paidOrder);
    mocks.constructEvent.mockReturnValue({ id: "evt_1", type: "checkout.session.completed", data: { object: { ...paidSession, shipping_details } } });
    await handleStripeWebhook("{}", "synthetic-signature");
    expect(mocks.updateClaimedOrder).toHaveBeenCalledWith("order1", "order-owner", expect.objectContaining({ status: "manual_review", stripePaymentIntentId: "pi_1", stripeAmountTotal: 2000, stripeTaxAmount: 0 }));
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it("revalidation leaves a failed checkout untouched", async () => {
    const service = await import("./order-service");
    mocks.getOrder.mockResolvedValue(paidOrder);
    mocks.retrieveSession.mockResolvedValue({ ...paidSession, amount_total: 1 });
    await expect(service.revalidatePaidCheckout("order1")).rejects.toMatchObject({ reason: "PaymentMismatch" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.updateClaimedOrder).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it("revalidation refreshes evidence but preserves manual review and never fulfills", async () => {
    const service = await import("./order-service");
    const review = { ...paidOrder, status: "manual_review" as const, error: { type: "ShippingAddressChanged", message: "Review required" } };
    mocks.getOrder.mockResolvedValue(review);
    mocks.retrieveSession.mockResolvedValue(paidSession);
    const result = await service.revalidatePaidCheckout("order1");
    expect(result).toMatchObject({ status: "manual_review", error: review.error, checkoutValidation: { source: "admin_revalidation" } });
    expect(mocks.retrieveSession).toHaveBeenCalledWith("cs_1", { timeout: 20000, maxNetworkRetries: 0 });
    expect(mocks.updateClaimedOrder).toHaveBeenCalledTimes(1);
    expect(mocks.updateClaimedOrder.mock.calls[0][2]).not.toHaveProperty("status");
    expect(mocks.updateClaimedOrder.mock.calls[0][2]).not.toHaveProperty("error");
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

  it("serializes two distinct paid events and an admin retry around one remote creation", async () => {
    const service = await import("./order-service");
    const store = ownedStore({ ...paidOrder, status: "checkout_created" });
    const entered = deferred<void>();
    const remote = deferred<{ id: number; status: string; external_id: string }>();
    mocks.createPrintfulOrder.mockImplementation(async () => { entered.resolve(); return remote.promise; });
    mocks.constructEvent.mockReturnValue({ id: "evt_a", type: "checkout.session.completed", data: { object: paidSession } });
    const first = service.handleStripeWebhook("{}", "signature");
    void first.catch(() => {});
    await entered.promise;
    mocks.constructEvent.mockReturnValue({ id: "evt_b", type: "checkout.session.async_payment_succeeded", data: { object: paidSession } });
    let eventError: unknown; let adminError: unknown;
    const second = service.handleStripeWebhook("{}", "signature").catch((error) => { eventError = error; });
    const admin = service.submitOrderToPrintful("order1").catch((error) => { adminError = error; });
    try {
      for (let step = 0; step < 30; step++) await Promise.resolve();
      expect(eventError).toMatchObject({ name: "ProcessingBusyError" });
      expect(adminError).toMatchObject({ name: "ProcessingBusyError" });
    } finally {
      remote.resolve({ id: 123, status: "draft", external_id: "order1" });
      await Promise.allSettled([first, second, admin]);
    }
    await expect(first).resolves.toMatchObject({ status: 200 });
    expect(mocks.createPrintfulOrder).toHaveBeenCalledTimes(1);
    expect(store.read()).toMatchObject({ printfulOrderId: 123, printfulExternalId: "order1", printfulStatus: "draft" });
  });

  it("persists identity and checks lookup before creation", async () => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.findPrintfulOrderByExternalId.mockImplementation(async (id) => { expect(store.read().printfulExternalId).toBe("order1"); expect(id).toBe("order1"); return null; });
    await service.submitOrderToPrintful("order1");
    expect(mocks.findPrintfulOrderByExternalId).toHaveBeenCalledTimes(1);
    expect(mocks.createPrintfulOrder.mock.calls[0][0]).toMatchObject({ printfulExternalId: "order1" });
  });

  it("leaves unavailable initial lookup pending without creating", async () => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.findPrintfulOrderByExternalId.mockRejectedValue(new Error("lookup unavailable"));
    await expect(service.submitOrderToPrintful("order1")).rejects.toThrow("lookup unavailable");
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(store.read()).toMatchObject({ status: "printful_pending", printfulExternalId: "order1" });
  });

  it.each(["timeout", "server", "duplicate400", "conflict409"])("recovers an accepted create after %s with the original identity", async (failure) => {
    const service = await import("./order-service");
    const { PrintfulApiError } = await import("./printful");
    const store = ownedStore(validatedOrder());
    const error = failure === "timeout" ? new DOMException("Timed out", "AbortError") : new PrintfulApiError("create failed", failure === "server" ? 503 : failure === "duplicate400" ? 400 : 409, { error: { code: "OR-13", reason: "EXTERNAL_ID_IN_USE" } });
    mocks.createPrintfulOrder.mockRejectedValue(error);
    mocks.findPrintfulOrderByExternalId.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 123, status: "draft", external_id: "order1" });
    await service.submitOrderToPrintful("order1");
    expect(store.read()).toMatchObject({ printfulOrderId: 123, printfulExternalId: "order1" });
    expect(mocks.findPrintfulOrderByExternalId.mock.calls).toEqual([["order1"], ["order1"]]);
    expect(mocks.createPrintfulOrder).toHaveBeenCalledTimes(1);
  });

  it("recovers crashed pending fulfillment only with previously persisted identity", async () => {
    const service = await import("./order-service");
    const store = ownedStore({ ...validatedOrder(), status: "printful_pending", printfulExternalId: "stable-original" });
    mocks.findPrintfulOrderByExternalId.mockResolvedValue({ id: 789, status: "draft", external_id: "stable-original" });
    await service.submitOrderToPrintful("order1");
    expect(store.read()).toMatchObject({ printfulOrderId: 789, printfulExternalId: "stable-original" });
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it("blocks pending fulfillment without durable identity", async () => {
    const service = await import("./order-service");
    ownedStore({ ...validatedOrder(), status: "printful_pending" });
    await expect(service.submitOrderToPrintful("order1")).rejects.toMatchObject({ reason: "OrderStatusBlocked" });
    expect(mocks.updateClaimedOrder).not.toHaveBeenCalled();
    expect(mocks.findPrintfulOrderByExternalId).not.toHaveBeenCalled();
  });

  it.each(["wrong", undefined])("rejects recovered provider identity %s", async (external_id) => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.findPrintfulOrderByExternalId.mockResolvedValue({ id: 123, status: "draft", external_id });
    await service.submitOrderToPrintful("order1");
    expect(store.read()).toMatchObject({ status: "manual_review", error: { type: "PrintfulIdentityMismatch" } });
    expect(store.read().printfulOrderId).toBeUndefined();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });

  it.each(["canceled", "failed"])("preserves remote %s existence for review without a success email", async (status) => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.findPrintfulOrderByExternalId.mockResolvedValue({ id: 123, status, external_id: "order1" });
    await service.submitOrderToPrintful("order1");
    expect(store.read()).toMatchObject({ status: "manual_review", printfulOrderId: 123, printfulStatus: status });
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("fences a late remote response after a new owner changed order state", async () => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    const entered = deferred<void>(); const remote = deferred<{ id: number; status: string; external_id: string }>();
    mocks.createPrintfulOrder.mockImplementation(async () => { entered.resolve(); return remote.promise; });
    const attempt = service.submitOrderToPrintful("order1");
    await entered.promise;
    store.replace({ ...store.read(), status: "canceled" });
    remote.resolve({ id: 123, status: "draft", external_id: "order1" });
    await expect(attempt).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
    expect(store.read().status).toBe("canceled");
    expect(store.read().printfulOrderId).toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not reclassify email failure as failed fulfillment", async () => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.sendEmail.mockRejectedValue(new Error("email unavailable"));
    await expect(service.submitOrderToPrintful("order1")).rejects.toThrow("email unavailable");
    expect(store.read()).toMatchObject({ status: "printful_confirmed", printfulOrderId: 123 });
  });

  it.each(["checkout.session.expired", "checkout.session.async_payment_failed"])("ignores late %s after fulfilled state", async (type) => {
    const service = await import("./order-service");
    const store = ownedStore({ ...validatedOrder(), status: "shipped", printfulOrderId: 123 });
    mocks.constructEvent.mockReturnValue({ id: "evt_late", type, data: { object: paidSession } });
    await service.handleStripeWebhook("{}", "signature");
    expect(store.read().status).toBe("shipped");
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.updateClaimedOrder).not.toHaveBeenCalled();
  });

  it("fences revalidation proof when ownership was replaced during the Stripe read", async () => {
    const service = await import("./order-service");
    const store = ownedStore(paidOrder);
    mocks.retrieveSession.mockImplementation(async () => { store.replace({ ...paidOrder, status: "canceled" }); return paidSession; });
    await expect(service.revalidatePaidCheckout("order1")).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
    expect(store.read().checkoutValidation).toBeUndefined();
    expect(store.read().status).toBe("canceled");
  });

  it("leaves a duplicate-ID rejection pending when recovery has not found it yet", async () => {
    const service = await import("./order-service"); const { PrintfulApiError } = await import("./printful");
    const store = ownedStore(validatedOrder());
    mocks.createPrintfulOrder.mockRejectedValue(new PrintfulApiError("External ID in use", 400, { error: { code: "OR-13" } }));
    await expect(service.submitOrderToPrintful("order1")).rejects.toThrow("External ID in use");
    expect(store.read()).toMatchObject({ status: "printful_pending", printfulExternalId: "order1" });
  });

  it("bounds Stripe revalidation reads to 20 seconds without a late proof write", async () => {
    vi.useFakeTimers();
    const service = await import("./order-service"); const store = ownedStore(paidOrder);
    const remote = deferred<Stripe.Checkout.Session>();
    mocks.retrieveSession.mockReturnValue(remote.promise);
    let failure: unknown;
    const attempt = service.revalidatePaidCheckout("order1").catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(20000);
    expect(failure).toMatchObject({ name: "StripeReadDeadlineExceeded" });
    await attempt;
    remote.resolve(paidSession);
    await Promise.resolve();
    expect(store.read().checkoutValidation).toBeUndefined();
    expect(mocks.updateClaimedOrder).not.toHaveBeenCalled();
  });

  it("validates the incoming paid session before pending crash recovery", async () => {
    const service = await import("./order-service");
    const store = ownedStore({ ...validatedOrder(), status: "printful_pending", printfulExternalId: "order1" });
    mocks.constructEvent.mockReturnValue({ id: "evt_foreign", type: "checkout.session.completed", data: { object: { ...paidSession, id: "cs_foreign" } } });
    await service.handleStripeWebhook("{}", "signature");
    expect(mocks.findPrintfulOrderByExternalId).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(store.read()).toMatchObject({ status: "manual_review", stripeSessionId: "cs_1", error: { type: "SessionMismatch" } });
  });

  it("does not call Printful when ownership is lost between lookup and creation", async () => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.findPrintfulOrderByExternalId.mockImplementation(async () => { store.replace({ ...store.read(), status: "canceled" }); return null; });
    await expect(service.submitOrderToPrintful("order1")).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(store.read().status).toBe("canceled");
  });

  it("keeps failed creation uncertain when its recovery lookup is unavailable", async () => {
    const service = await import("./order-service");
    const store = ownedStore(validatedOrder());
    mocks.createPrintfulOrder.mockRejectedValue(new DOMException("Timed out", "AbortError"));
    mocks.findPrintfulOrderByExternalId.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("recovery unavailable"));
    await expect(service.submitOrderToPrintful("order1")).rejects.toThrow("recovery unavailable");
    expect(store.read()).toMatchObject({ status: "printful_pending", printfulExternalId: "order1" });
    expect(mocks.createPrintfulOrder).toHaveBeenCalledTimes(1);
  });
});
