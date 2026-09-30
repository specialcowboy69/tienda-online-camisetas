import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import type { StoreOrder } from "./types";

// Only the Firestore transport and Stripe SDK reads are replaced. The order,
// lease, refund, email-job and Printful/Resend HTTP implementations stay real.
const state = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), refunds: [] as Stripe.Refund[], emailFails: true, creates: 0, emails: [] as RequestInit[], createPayloads: [] as Record<string, unknown>[], createResponse: null as Promise<Response> | null, started: null as (() => void) | null }));
vi.mock("./env", () => ({
  env: { ADMIN_SECRET: "synthetic-admin", RESEND_API_KEY: "synthetic-email", RESEND_FROM_EMAIL: "Club <orders@example.test>" },
  requiredEnv: () => "synthetic-provider", isStripeTaxEnabled: () => false,
  shouldConfirmPrintfulOrders: () => false, getBaseUrl: () => "http://localhost:3100"
}));
vi.mock("./firebase-admin", () => ({ getDb: () => ({ collection, runTransaction: transaction }) }));
vi.mock("./stripe", async (original) => ({ ...await original<typeof import("./stripe")>(), getStripe: () => ({
  webhooks: { constructEvent: (body: string) => JSON.parse(body) },
  paymentIntents: { retrieve: async () => ({ id: "pi_paid", metadata: { order_id: "order1" }, status: "succeeded", currency: "eur", amount_received: 2000 }) },
  refunds: { list: async () => ({ data: state.refunds, has_more: false }) },
  checkout: { sessions: { retrieve: async () => session, list: async () => ({ data: [session], has_more: false }) } }
}) }));

function snapshot(path: string) { return { exists: state.records.has(path), data: () => structuredClone(state.records.get(path)) }; }
function field(data: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], data);
}
function collection(name: string) {
  return {
    doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }),
    where: (key: string, op: string, value: unknown) => {
      const get = async (bound = 100) => ({ docs: [...state.records.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && path.slice(name.length + 1).indexOf("/") < 0 && (op === "in" ? (value as unknown[]).includes(field(data, key)) : op === ">" ? String(field(data, key) || "") > String(value) : field(data, key) === value)).slice(0, bound).map(([path]) => snapshot(path)) });
      return { get: () => get(), limit: (bound: number) => ({ get: () => get(bound) }) };
    }
  };
}
let queue = Promise.resolve();
function transaction(callback: (tx: unknown) => Promise<unknown>) {
  const result = queue.then(async () => {
    const writes: Array<[string, Record<string, unknown>]> = [];
    const value = await callback({
      get: async (ref: { path: string }) => snapshot(ref.path),
      set: (ref: { path: string }, patch: Record<string, unknown>, options?: { merge: boolean }) => {
        const next = options?.merge ? { ...state.records.get(ref.path) } : {};
        for (const [key, item] of Object.entries(patch)) {
          if (item instanceof FieldValue && item.isEqual(FieldValue.delete())) delete next[key];
          else next[key] = item;
        }
        writes.push([ref.path, next]);
      }
    });
    for (const [path, data] of writes) state.records.set(path, data);
    return value;
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
const order: StoreOrder = {
  id: "order1", status: "checkout_created", stripeSessionId: "cs_paid",
  recipient: { name: "Synthetic Customer", email: "customer@example.test", address1: "1 Test Street", address2: "Apt 42", city: "Madrid", zip: "28001", countryCode: "ES" },
  items: [{ productId: "test", productName: "Test Tee", syncVariantId: 201, variantId: 301, variantName: "Black / M", quantity: 1, unitAmount: 2000, currency: "eur" }],
  shippingRate: { id: "STANDARD", name: "Standard", rate: "0", currency: "eur" },
  totals: { subtotal: 2000, shipping: 0, total: 2000, currency: "eur" }, createdAt: "2026-09-30T12:00:00Z", updatedAt: "2026-09-30T12:00:00Z"
};
const session = { id: "cs_paid", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_paid", metadata: { order_id: "order1" }, client_reference_id: "order1", amount_total: 2000, currency: "eur", total_details: { amount_tax: 0 }, shipping_details: { address: { line1: "1 Test Street", line2: "Apt 42", city: "Madrid", postal_code: "28001", country: "ES" } } } as unknown as Stripe.Checkout.Session;
function webhook(id: string) { return JSON.stringify({ id, type: "checkout.session.completed", data: { object: session } }); }
function readOrder() { return state.records.get("orders/order1")!; }
function jobs() { return [...state.records.entries()].filter(([path]) => path.startsWith("emailJobs/")); }
function refund(status: Stripe.Refund["status"], amount: number): Stripe.Refund { return { id: "re_test", payment_intent: "pi_paid", amount, status, currency: "eur" } as Stripe.Refund; }

describe("combined order safety with real services and synthetic transports", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    state.records.clear(); state.records.set("orders/order1", structuredClone(order) as unknown as Record<string, unknown>);
    state.refunds = []; state.emailFails = true; state.creates = 0; state.emails = []; state.createPayloads = []; state.createResponse = null; state.started = null;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://api.printful.com/orders/@")) return new Response('{"result":"Not found"}', { status: 404 });
      if (url.startsWith("https://api.printful.com/orders?")) {
        state.creates++; state.createPayloads.push(JSON.parse(String(init?.body))); state.started?.();
        return state.createResponse || new Response('{"result":{"id":123,"status":"draft","external_id":"order1"}}');
      }
      if (url === "https://api.resend.com/emails") {
        state.emails.push(init!);
        return state.emailFails ? new Response('{"message":"synthetic failure contains no usable receipt"}', { status: 503 }) : new Response('{"id":"email-accepted"}');
      }
      throw new Error(`Unexpected synthetic transport URL ${url}`);
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  // Break caught: email failure regresses fulfillment, or recovery creates a
  // second order/message instead of replaying the durable job.
  it.each(["webhook", "admin"])("recovers failed confirmation through %s after one paid complete-address fulfillment", async (recovery) => {
    const service = await import("./order-service");
    await expect(service.handleStripeWebhook(webhook("evt_first"), "synthetic-signature")).rejects.toMatchObject({ name: "ProcessingBusyError" });
    expect(readOrder()).toMatchObject({ status: "printful_confirmed", printfulOrderId: 123, printfulStatus: "draft", checkoutValidation: { paidAmount: 2000 }, refundSummary: { status: "none" } });
    expect(state.createPayloads).toMatchObject([{ recipient: { address2: "Apt 42" }, external_id: "order1" }]);
    expect(jobs()).toHaveLength(1); expect(jobs()[0][1]).toMatchObject({ status: "pending", attempts: 1 });
    state.emailFails = false;
    if (recovery === "webhook") expect((await service.handleStripeWebhook(webhook("evt_first"), "synthetic-signature")).status).toBe(200);
    else {
      const { POST } = await import("../app/api/admin/orders/[orderId]/retry-email/route");
      const response = await POST(new NextRequest("http://localhost:3100/api/admin/orders/order1/retry-email", { method: "POST", headers: { "x-admin-secret": "synthetic-admin" } }), { params: Promise.resolve({ orderId: "order1" }) });
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ results: [{ result: "accepted" }] });
    }
    await service.handleStripeWebhook(webhook("evt_later"), "synthetic-signature");
    expect(state.creates).toBe(1); expect(state.emails).toHaveLength(2);
    expect(state.emails[1].body).toBe(state.emails[0].body); expect(state.emails[1].headers).toEqual(state.emails[0].headers);
    expect(jobs()[0][1]).toMatchObject({ status: "accepted", providerEmailId: "email-accepted", attempts: 2 });
    expect(readOrder().status).toBe("printful_confirmed");
  });

  // Break caught: interpreting zero succeeded money as no refund activity,
  // or overwriting a refund latch during payment revalidation.
  it.each([["succeeded", 500, "partial"], ["pending", 500, "none"], ["requires_action", 500, "none"]] as const)("blocks fresh fabrication after %s refund and retains the hold on revalidation", async (status, amount, summaryStatus) => {
    state.refunds = [refund(status, amount)]; const service = await import("./order-service");
    await expect(service.handleStripeWebhook(webhook("evt_paid"), "synthetic-signature")).rejects.toMatchObject({ reason: "RefundReviewRequired" });
    expect(state.creates).toBe(0); expect(state.emails).toHaveLength(0);
    expect(readOrder()).toMatchObject({ fulfillmentBlocked: true, refundSummary: { status: summaryStatus, refundCount: 1, pendingCount: status === "succeeded" ? 0 : 1 } });
    state.refunds = [];
    await service.revalidatePaidCheckout("order1");
    expect(readOrder()).toMatchObject({ fulfillmentBlocked: true, refundSummary: { status: "none", fulfillmentBlocked: true } });
    await expect(service.submitOrderToPrintful("order1")).rejects.toMatchObject({ reason: "RefundReviewRequired" });
    expect(state.creates).toBe(0);
  });

  // Break caught: event-ID deduplication alone allowing two distinct paid
  // events to create fulfillment concurrently for one order.
  it("serializes different event IDs targeting the same order and recovers the busy event", async () => {
    state.emailFails = false; let resolve!: (response: Response) => void;
    const started = new Promise<void>((done) => { state.started = done; });
    state.createResponse = new Promise((done) => { resolve = done; });
    const service = await import("./order-service");
    const first = service.handleStripeWebhook(webhook("evt_a"), "synthetic-signature"); await started;
    await expect(service.handleStripeWebhook(webhook("evt_b"), "synthetic-signature")).rejects.toMatchObject({ name: "ProcessingBusyError" });
    expect(state.records.get("webhookEvents/stripe:evt_b")?.status).toBe("failed");
    resolve(new Response('{"result":{"id":123,"status":"draft","external_id":"order1"}}')); await first;
    await service.handleStripeWebhook(webhook("evt_b"), "synthetic-signature");
    expect(state.creates).toBe(1); expect(state.emails).toHaveLength(1);
    expect(state.records.get("webhookEvents/stripe:evt_a")?.status).toBe("processed"); expect(state.records.get("webhookEvents/stripe:evt_b")?.status).toBe("processed");
  });

  // Break caught: token/expiry omission in writes lets old ownership erase
  // canonical financial state or replace a newer accepted email receipt.
  it("fences expired order and email owners against the refund latch and accepted receipt", async () => {
    const db = await import("./firestore"); const { buildEmailJob, processEmailJob } = await import("./email-jobs");
    const old = await db.claimOrderProcessing("order1"); if (old.kind !== "claimed") throw new Error("fixture claim failed");
    const job = buildEmailJob(order, "order_confirmation"); await db.completeClaimedFulfillment("order1", old.lease.token, {}, job);
    const oldEmail = await db.claimEmailJob(job.id); if (oldEmail.kind !== "claimed") throw new Error("fixture email claim failed");
    vi.advanceTimersByTime(120000);
    const current = await db.claimOrderProcessing("order1"); if (current.kind !== "claimed") throw new Error("replacement claim failed");
    await db.updateClaimedOrder("order1", current.lease.token, { stripePaymentIntentId: "pi_paid" });
    state.refunds = [refund("succeeded", 500)];
    await (await import("./refund-service")).reconcileOrderRefunds((await db.getOrder("order1"))!, current.lease.token);
    state.emailFails = false; expect(await processEmailJob(job.id)).toBe("accepted");
    expect(await db.updateClaimedOrder("order1", old.lease.token, { fulfillmentBlocked: false, refundSummary: undefined })).toBe(false);
    expect(await db.completeClaimedFulfillment("order1", old.lease.token, { status: "failed" }, job)).toBe(false);
    expect(await db.finishEmailJob(job.id, oldEmail.lease.token, "pending", { providerEmailId: "stale-receipt" })).toBe(false);
    expect(readOrder()).toMatchObject({ fulfillmentBlocked: true, refundSummary: { status: "partial", refundedAmount: 500 } });
    expect(jobs()[0][1]).toMatchObject({ status: "accepted", providerEmailId: "email-accepted" });
  });
});
