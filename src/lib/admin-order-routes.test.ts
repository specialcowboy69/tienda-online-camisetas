import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreOrder } from "./types";

const mocks = vi.hoisted(() => ({ getOrder: vi.fn(), listOrders: vi.fn(), updateOrder: vi.fn(), updateOrderStatus: vi.fn(), createPrintfulOrder: vi.fn(), retrieve: vi.fn() }));
vi.mock("./env", () => ({ env: { ADMIN_SECRET: "synthetic-admin-secret" }, isStripeTaxEnabled: () => false }));
vi.mock("./firestore", () => ({ getOrder: mocks.getOrder, listOrdersForReview: mocks.listOrders, updateOrder: mocks.updateOrder, updateOrderStatus: mocks.updateOrderStatus }));
vi.mock("./stripe", () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }) }));
vi.mock("./printful", () => ({ createPrintfulOrder: mocks.createPrintfulOrder, PrintfulApiError: class extends Error {} }));
vi.mock("./email", () => ({ sendOrderConfirmationEmail: vi.fn() }));

const order: StoreOrder = { id: "order1", status: "failed", stripeSessionId: "cs_1", recipient: { name: "Ada", email: "ada@example.com", address1: "Main St", city: "Madrid", countryCode: "ES", zip: "28001" }, items: [], shippingRate: { id: "STANDARD", name: "Standard", rate: "0", currency: "eur" }, totals: { subtotal: 2000, shipping: 0, total: 2000, currency: "eur" }, createdAt: "2026-09-30", updatedAt: "2026-09-30" };
const context = { params: Promise.resolve({ orderId: "order1" }) };
function request(path: string, authenticated = true) {
  return new NextRequest(`http://localhost/api/admin/orders/${path}`, { method: "POST", headers: authenticated ? { "x-admin-secret": "synthetic-admin-secret" } : {} });
}
describe("authenticated order safety routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getOrder.mockResolvedValue(order); mocks.listOrders.mockResolvedValue([order]); });
  it("returns 409 with a reason before blocked retries can write or call Printful", async () => {
    const { POST } = await import("../app/api/admin/orders/[orderId]/retry-printful/route");
    const response = await POST(request("order1/retry-printful"), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "CheckoutValidationRequired" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
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
  });
  it("returns server eligibility alongside review orders", async () => {
    const { GET } = await import("../app/api/admin/orders/route");
    const response = await GET(request(""));
    expect(await response.json()).toMatchObject({ orders: [{ id: "order1", printfulSubmissionEligibility: { allowed: false, reason: "CheckoutValidationRequired" } }] });
  });
});
