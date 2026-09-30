import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreOrder } from "./types";
import { evaluatePaidCheckout } from "./checkout-validation";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ retryEmails: vi.fn(), getOrder: vi.fn(), listOrders: vi.fn(), updateOrder: vi.fn(), updateOrderStatus: vi.fn(), createPrintfulOrder: vi.fn(), retrieve: vi.fn(), claim: vi.fn(), renew: vi.fn(), updateClaimed: vi.fn(), release: vi.fn() }));
vi.mock("./email-jobs", async (importOriginal) => ({ ...await importOriginal<typeof import("./email-jobs")>(), retryOrderEmails: mocks.retryEmails }));
vi.mock("./env", () => ({ env: { ADMIN_SECRET: "synthetic-admin-secret" }, isStripeTaxEnabled: () => false }));
vi.mock("./firestore", () => ({ getOrder: mocks.getOrder, listOrdersForReview: mocks.listOrders, updateOrder: mocks.updateOrder, updateOrderStatus: mocks.updateOrderStatus, claimOrderProcessing: mocks.claim, renewOrderProcessing: mocks.renew, updateClaimedOrder: mocks.updateClaimed, releaseOrderProcessing: mocks.release }));
vi.mock("./stripe", () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }) }));
vi.mock("./printful", () => ({ createPrintfulOrder: mocks.createPrintfulOrder, PrintfulApiError: class extends Error {} }));
vi.mock("./email", () => ({ sendOrderConfirmationEmail: vi.fn() }));

const order: StoreOrder = { id: "order1", status: "failed", stripeSessionId: "cs_1", recipient: { name: "Ada", email: "ada@example.com", address1: "Main St", city: "Madrid", countryCode: "ES", zip: "28001" }, items: [], shippingRate: { id: "STANDARD", name: "Standard", rate: "0", currency: "eur" }, totals: { subtotal: 2000, shipping: 0, total: 2000, currency: "eur" }, createdAt: "2026-09-30", updatedAt: "2026-09-30" };
const context = { params: Promise.resolve({ orderId: "order1" }) };
function request(path: string, authenticated = true) {
  return new NextRequest(`http://localhost/api/admin/orders/${path}`, { method: "POST", headers: authenticated ? { "x-admin-secret": "synthetic-admin-secret" } : {} });
}
describe("authenticated order safety routes", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.getOrder.mockResolvedValue(order); mocks.listOrders.mockResolvedValue([order]); mocks.claim.mockResolvedValue({ kind: "claimed", value: order, lease: { token: "owner", expiresAtMs: Date.now() + 120000 } }); mocks.renew.mockResolvedValue(true); mocks.updateClaimed.mockResolvedValue(true); mocks.release.mockResolvedValue(true); });
  it("returns 409 with a reason before blocked retries can write or call Printful", async () => {
    const { POST } = await import("../app/api/admin/orders/[orderId]/retry-printful/route");
    const response = await POST(request("order1/retry-printful"), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "CheckoutValidationRequired" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.updateClaimed).not.toHaveBeenCalled();
    expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated revalidation before Stripe or order access", async () => {
    const { POST } = await import("../app/api/admin/orders/[orderId]/revalidate-checkout/route");
    const response = await POST(request("order1/revalidate-checkout", false), context);
    expect(response.status).toBe(401);
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.getOrder).not.toHaveBeenCalled();
  });
  it("returns validation failures without mutating the order", async () => {
    const { POST } = await import("../app/api/admin/orders/[orderId]/revalidate-checkout/route");
    mocks.retrieve.mockResolvedValue({ id: "cs_1", metadata: { order_id: "order1" }, mode: "payment", status: "complete", payment_status: "unpaid" });
    const response = await POST(request("order1/revalidate-checkout"), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "PaymentNotCompleted" });
    expect(mocks.updateOrder).not.toHaveBeenCalled(); expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
    expect(mocks.updateClaimed).not.toHaveBeenCalled();
  });
  it("returns server eligibility alongside review orders", async () => {
    const { GET } = await import("../app/api/admin/orders/route");
    const response = await GET(request(""));
    expect(await response.json()).toMatchObject({ orders: [{ id: "order1", printfulSubmissionEligibility: { allowed: false, reason: "CheckoutValidationRequired" } }] });
  });
  it.each(["missing", "valid", "invalid"])("projects %s checkout proof separately from fulfillment eligibility", async (status) => {
    const payment = { id: "cs_1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: "order1" }, amount_total: 2000, currency: "eur", shipping_details: { address: { line1: "Main St", city: "Madrid", country: "ES", postal_code: "28001" } } } as unknown as Stripe.Checkout.Session;
    const validation = evaluatePaidCheckout(order, payment, { source: "stripe_webhook", stripeTaxEnabled: false, validatedAt: "2026-09-30T12:00:00Z" });
    if (!validation.valid) throw new Error("Invalid fixture");
    const stored = { ...order, status: "manual_review", stripePaymentIntentId: "pi_1", ...(status === "missing" ? {} : { checkoutValidation: validation.evidence }), ...(status === "invalid" ? { recipient: { ...order.recipient, address2: "Edited apartment" } } : {}) };
    mocks.listOrders.mockResolvedValue([stored]);
    const { GET } = await import("../app/api/admin/orders/route");
    const response = await GET(request(""));
    expect(await response.json()).toMatchObject({ orders: [{ checkoutValidationStatus: status, printfulSubmissionEligibility: { allowed: false } }] });
  });
  it.each(["retry-printful", "revalidate-checkout"])("returns retryable 503 when %s meets a held order lease", async (path) => {
    mocks.claim.mockResolvedValue({ kind: "busy", retryAfterSeconds: 77 });
    const { POST } = path === "retry-printful" ? await import("../app/api/admin/orders/[orderId]/retry-printful/route") : await import("../app/api/admin/orders/[orderId]/revalidate-checkout/route");
    const response = await POST(request(`order1/${path}`), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("77");
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.createPrintfulOrder).not.toHaveBeenCalled();
  });
  it("returns retryable 503 when revalidation loses order ownership", async () => {
    mocks.retrieve.mockResolvedValue({ id: "cs_1", metadata: { order_id: "order1" }, mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 2000, currency: "eur", shipping_details: { address: { line1: "Main St", city: "Madrid", country: "ES", postal_code: "28001" } } });
    mocks.updateClaimed.mockResolvedValue(false);
    const { POST } = await import("../app/api/admin/orders/[orderId]/revalidate-checkout/route");
    const response = await POST(request("order1/revalidate-checkout"), context);
    expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("1");
  });
  it("rejects unauthenticated email recovery before any work", async () => {
    const { POST } = await import("../app/api/admin/orders/[orderId]/retry-email/route");
    expect((await POST(request("order1/retry-email", false), context)).status).toBe(401);
    expect(mocks.retryEmails).not.toHaveBeenCalled(); expect(mocks.getOrder).not.toHaveBeenCalled();
  });
  it("retries email independently of fulfillment and reports acceptance accurately", async () => {
    mocks.retryEmails.mockResolvedValue([{ jobId: "job1", result: "accepted" }]);
    const { POST } = await import("../app/api/admin/orders/[orderId]/retry-email/route");
    const response = await POST(request("order1/retry-email"), context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ results: [{ jobId: "job1", result: "accepted" }] });
    expect(mocks.retryEmails).toHaveBeenCalledWith("order1"); expect(mocks.createPrintfulOrder).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
  });
  it.each(["retry", "busy"])("keeps %s email recovery retryable", async (result) => {
    mocks.retryEmails.mockResolvedValue([{ jobId: "job1", result }]);
    const { POST } = await import("../app/api/admin/orders/[orderId]/retry-email/route");
    const response = await POST(request("order1/retry-email"), context);
    expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("1");
  });
});
