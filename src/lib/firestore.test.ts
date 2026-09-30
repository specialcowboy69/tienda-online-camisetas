import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { StoreOrder } from "./types";

const mocks = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; ref: { path: string }; data: () => unknown }>,
  orderBy: vi.fn(),
  collectionGet: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  docSet: vi.fn(),
  collectionAdd: vi.fn(),
  runTransaction: vi.fn(),
  transactionGet: vi.fn(),
  transactionSet: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn()
}));

vi.mock("./firebase-admin", () => ({
  getDb: () => ({
    batch: vi.fn(() => ({
      set: mocks.batchSet,
      commit: mocks.batchCommit
    })),
    collection: mocks.collection,
    runTransaction: mocks.runTransaction
  })
}));

describe("Firestore persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.docs = [];
    mocks.collectionGet.mockResolvedValue({ docs: mocks.docs });
    mocks.doc.mockImplementation((collection: string, id: string) => ({
      id,
      path: `${collection}/${id}`,
      set: mocks.docSet
    }));
    mocks.collection.mockImplementation((collection: string) => ({
      orderBy: mocks.orderBy,
      get: mocks.collectionGet,
      doc: (id: string) => mocks.doc(collection, id),
      add: mocks.collectionAdd
    }));
    mocks.docSet.mockResolvedValue(undefined);
    mocks.collectionAdd.mockResolvedValue(undefined);
    mocks.transactionGet.mockResolvedValue({ exists: false, data: () => undefined });
    mocks.runTransaction.mockImplementation(async (callback) => callback({
      get: mocks.transactionGet,
      set: mocks.transactionSet
    }));
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.orderBy.mockReturnValue({
      get: vi.fn(async () => ({ docs: mocks.docs }))
    });
  });

  it("excludes ignored products from the public catalog", async () => {
    mocks.docs = [
      {
        id: "active",
        ref: { path: "products/active" },
        data: () => ({
          id: "active",
          syncProductId: 1,
          name: "Active product",
          variants: [],
          updatedAt: "2026-09-07T00:00:00.000Z"
        })
      },
      {
        id: "deleted",
        ref: { path: "products/deleted" },
        data: () => ({
          id: "deleted",
          syncProductId: 2,
          name: "Deleted product",
          variants: [],
          isIgnored: true,
          updatedAt: "2026-09-07T00:00:00.000Z"
        })
      }
    ];

    const { listCatalogProducts } = await import("./firestore");

    await expect(listCatalogProducts()).resolves.toEqual([
      {
        id: "active",
        syncProductId: 1,
        name: "Active product",
        variants: [],
        updatedAt: "2026-09-07T00:00:00.000Z"
      }
    ]);
  });

  it("marks products missing from a successful catalog sync as ignored", async () => {
    const staleRef = { path: "products/deleted" };
    const alreadyIgnoredRef = { path: "products/already-ignored" };
    mocks.docs = [
      {
        id: "active",
        ref: { path: "products/active" },
        data: () => ({
          id: "active",
          syncProductId: 1,
          name: "Active product",
          variants: [],
          updatedAt: "2026-09-07T00:00:00.000Z"
        })
      },
      {
        id: "deleted",
        ref: staleRef,
        data: () => ({
          id: "deleted",
          syncProductId: 2,
          name: "Deleted product",
          variants: [],
          isIgnored: false,
          updatedAt: "2026-09-07T00:00:00.000Z"
        })
      },
      {
        id: "already-ignored",
        ref: alreadyIgnoredRef,
        data: () => ({
          id: "already-ignored",
          syncProductId: 3,
          name: "Already ignored product",
          variants: [],
          isIgnored: true,
          updatedAt: "2026-09-07T00:00:00.000Z"
        })
      }
    ];
    mocks.collectionGet.mockResolvedValue({ docs: mocks.docs });
    const activeProduct = {
      id: "active",
      syncProductId: 1,
      name: "Active product",
      variants: [],
      updatedAt: "2026-09-08T00:00:00.000Z"
    };

    const { saveCatalogProducts } = await import("./firestore");

    await saveCatalogProducts([activeProduct]);

    expect(mocks.batchSet).toHaveBeenCalledWith(expect.objectContaining({ id: "active" }), activeProduct, { merge: true });
    expect(mocks.batchSet).toHaveBeenCalledWith(
      staleRef,
      { isIgnored: true, updatedAt: expect.any(String) },
      { merge: true }
    );
    expect(mocks.batchSet).not.toHaveBeenCalledWith(alreadyIgnoredRef, expect.anything(), expect.anything());
    expect(mocks.batchCommit).toHaveBeenCalledOnce();
  });

  it("writes the exact order to its document in the orders collection", async () => {
    const order: StoreOrder = {
      id: "order-test",
      status: "draft",
      recipient: {
        name: "Test Customer",
        email: "customer@example.test",
        address1: "1 Test Street",
        city: "New York",
        stateCode: "NY",
        countryCode: "US",
        zip: "10001"
      },
      items: [{
        productId: "product-test",
        productName: "Test Shirt",
        syncVariantId: 201,
        variantId: 301,
        variantName: "Black / L",
        quantity: 1,
        unitAmount: 2500,
        currency: "usd"
      }],
      shippingRate: { id: "STANDARD", name: "Standard", rate: "0.00", currency: "USD" },
      totals: { subtotal: 2500, shipping: 0, total: 2500, currency: "usd" },
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z"
    };
    const { createOrder } = await import("./firestore");

    await createOrder(order);

    expect(mocks.collection).toHaveBeenCalledWith("orders");
    expect(mocks.doc).toHaveBeenCalledWith("orders", "order-test");
    expect(mocks.docSet).toHaveBeenCalledOnce();
    expect(mocks.docSet).toHaveBeenCalledWith(order);
  });

  it("claims a missing webhook event with the SDK increment and timestamp values", async () => {
    const payload = { type: "checkout.session.completed" };
    const { beginWebhookEventProcessing } = await import("./firestore");
    const startedAt = Date.now();

    await expect(beginWebhookEventProcessing("stripe", "evt-test", payload)).resolves.toMatchObject({ kind: "claimed", value: null, lease: { token: expect.any(String), expiresAtMs: expect.any(Number) } });

    const finishedAt = Date.now();
    expect(mocks.collection).toHaveBeenCalledWith("webhookEvents");
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.transactionGet).toHaveBeenCalledWith(expect.objectContaining({ path: "webhookEvents/stripe:evt-test" }));
    expect(mocks.transactionSet).toHaveBeenCalledOnce();
    expect(mocks.transactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "webhookEvents/stripe:evt-test" }),
      {
        source: "stripe",
        eventId: "evt-test",
        payload,
        status: "processing",
        lease: { token: expect.any(String), expiresAtMs: expect.any(Number) },
        attempts: FieldValue.increment(1),
        updatedAt: expect.any(Timestamp)
      },
      { merge: true }
    );
    const writtenAt = mocks.transactionSet.mock.calls[0][1].updatedAt as Timestamp;
    expect(writtenAt.toMillis()).toBeGreaterThanOrEqual(startedAt);
    expect(writtenAt.toMillis()).toBeLessThanOrEqual(finishedAt);
  });

  it("does not write a webhook event that has already been processed", async () => {
    mocks.transactionGet.mockResolvedValue({ exists: true, data: () => ({ status: "processed" }) });
    const { beginWebhookEventProcessing } = await import("./firestore");

    await expect(beginWebhookEventProcessing("stripe", "evt-processed", {})).resolves.toEqual({ kind: "processed" });

    expect(mocks.transactionGet).toHaveBeenCalledWith(expect.objectContaining({ path: "webhookEvents/stripe:evt-processed" }));
    expect(mocks.transactionSet).not.toHaveBeenCalled();
    expect(mocks.docSet).not.toHaveBeenCalled();
  });

  it("records a sync run with the SDK server timestamp in the syncRuns collection", async () => {
    const { createSyncRun } = await import("./firestore");

    await createSyncRun({ status: "success", productCount: 2, variantCount: 4 });

    expect(mocks.collection).toHaveBeenCalledWith("syncRuns");
    expect(mocks.collectionAdd).toHaveBeenCalledOnce();
    expect(mocks.collectionAdd).toHaveBeenCalledWith({
      status: "success",
      productCount: 2,
      variantCount: 4,
      createdAt: FieldValue.serverTimestamp()
    });
  });
});

describe("owned processing leases", () => {
  const records = new Map<string, Record<string, unknown>>();
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    records.clear();
    mocks.collection.mockImplementation((name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }));
    let queue = Promise.resolve();
    mocks.runTransaction.mockImplementation((callback) => {
      const result = queue.then(() => callback({
        get: async (ref: { path: string }) => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
        set: (ref: { path: string }, patch: Record<string, unknown>, options?: { merge: boolean }) => {
          const previous = records.get(ref.path) || {};
          const next = options?.merge ? { ...previous } : {};
          for (const [key, value] of Object.entries(patch)) {
            if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[key];
            else if (value instanceof FieldValue && value.isEqual(FieldValue.increment(1))) next[key] = Number(previous[key] || 0) + 1;
            else next[key] = value;
          }
          records.set(ref.path, next);
        }
      }));
      queue = result.then(() => undefined, () => undefined);
      return result;
    });
  });
  afterEach(() => vi.useRealTimers());

  it("persists paginated refund snapshots under the order and fences stale writes", async () => {
    const db = await import("./firestore");
    expect(db).toHaveProperty("persistClaimedRefundSnapshots");
    records.set("orders/order_1", { id: "order_1", status: "shipped" });
    const claim = await db.claimOrderProcessing("order_1");
    if (claim.kind !== "claimed") throw new Error("Expected claim");
    const refunds = Array.from({ length: 501 }, (_, index) => ({ id: `re_${index}`, amount: 1, currency: "eur", status: "succeeded" as const, paymentIntentId: "pi_1", reconciledAt: "now" }));
    expect(await db.persistClaimedRefundSnapshots("order_1", claim.lease.token, refunds)).toBe(true);
    expect(records.get("orders/order_1/refunds/re_500")).toMatchObject({ amount: 1 });
    expect(records.get("orders/order_1")?.status).toBe("shipped");
    vi.advanceTimersByTime(120000);
    expect(await db.persistClaimedRefundSnapshots("order_1", claim.lease.token, [{ ...refunds[0], amount: 2 }])).toBe(false);
    expect(records.get("orders/order_1/refunds/re_0")?.amount).toBe(1);
  });
  it("preserves independent refund data when a later shipment receipt updates fulfillment", async () => {
    const db = await import("./firestore");
    const refundSummary = { status: "full", refundedAmount: 2200, paidAmount: 2200, fulfillmentBlocked: true };
    records.set("orders/order_1", { id: "order_1", status: "printful_confirmed", refundSummary, fulfillmentBlocked: true });
    const claim = await db.claimOrderProcessing("order_1"); if (claim.kind !== "claimed") throw new Error("Expected claim");
    expect(await db.applyClaimedShipment("order_1", claim.lease.token, { status: "shipped", tracking: { carrier: "Carrier" } })).toBe(true);
    expect(records.get("orders/order_1")).toMatchObject({ status: "shipped", refundSummary, fulfillmentBlocked: true });
  });

  it("surfaces held and unresolved orders even when their fulfillment status is shipped", async () => {
    const db = await import("./firestore");
    const held = { id: "held", status: "paid", fulfillmentBlocked: true, updatedAt: "2026-09-30" };
    const unknown = { id: "unknown", status: "shipped", refundReviewReason: "Read failed", updatedAt: "2026-09-29" };
    const refunded = { id: "refunded", status: "shipped", refundSummary: { refundCount: 1 }, updatedAt: "2026-09-28" };
    mocks.collection.mockImplementation((name: string) => ({ where: (field: string) => ({ limit: () => ({ get: async () => ({ docs: name === "orders" && field === "fulfillmentBlocked" ? [{ data: () => held }] : name === "orders" && field === "refundReviewReason" ? [{ data: () => unknown }] : name === "orders" && field === "refundSummary.refundCount" ? [{ data: () => refunded }] : [] }) }) }) }));
    expect((await db.listOrdersForReview()).map((order) => order.id)).toEqual(["held", "unknown", "refunded"]);
  });
  it("refuses an ambiguous persisted PaymentIntent association", async () => {
    const db = await import("./firestore");
    let limit = 0;
    mocks.collection.mockImplementation(() => ({ where: () => ({ limit: (value: number) => { limit = value; return { get: async () => ({ empty: false, docs: [{ data: () => ({ id: "one" }) }, { data: () => ({ id: "two" }) }].slice(0, value) }) }; } }) }));
    await expect(db.findOrderByStripePaymentIntentId("pi_1")).rejects.toThrow("Multiple orders"); expect(limit).toBe(2);
  });

  it("denies a second event worker and admits a different owner at expiry", async () => {
    const db = await import("./firestore");
    const first = await db.beginWebhookEventProcessing("stripe", "evt_1", {});
    expect(first).toMatchObject({ kind: "claimed" });
    expect(await db.beginWebhookEventProcessing("stripe", "evt_1", {})).toEqual({ kind: "busy", retryAfterSeconds: 120 });
    vi.advanceTimersByTime(119_001);
    expect(await db.beginWebhookEventProcessing("stripe", "evt_1", {})).toEqual({ kind: "busy", retryAfterSeconds: 1 });
    vi.advanceTimersByTime(999);
    const second = await db.beginWebhookEventProcessing("stripe", "evt_1", {});
    expect(second).toMatchObject({ kind: "claimed" });
    if (first.kind === "claimed" && second.kind === "claimed") expect(second.lease.token).not.toBe(first.lease.token);
    expect(records.get("webhookEvents/stripe:evt_1")?.attempts).toBe(2);
  });

  it("fences stale event finish and failure, including a newer completed event", async () => {
    const db = await import("./firestore");
    const first = await db.beginWebhookEventProcessing("stripe", "evt_1", {});
    if (first.kind !== "claimed") throw new Error("Expected claim");
    vi.advanceTimersByTime(120_000);
    expect(await db.finishWebhookEventProcessing("stripe", "evt_1", first.lease.token)).toBe(false);
    expect(await db.failWebhookEventProcessing("stripe", "evt_1", first.lease.token, {})).toBe(false);
    const second = await db.beginWebhookEventProcessing("stripe", "evt_1", {});
    if (second.kind !== "claimed") throw new Error("Expected recovery claim");
    const current = { ...records.get("webhookEvents/stripe:evt_1") };
    expect(await db.finishWebhookEventProcessing("stripe", "evt_1", first.lease.token)).toBe(false);
    expect(await db.failWebhookEventProcessing("stripe", "evt_1", first.lease.token, {})).toBe(false);
    expect(records.get("webhookEvents/stripe:evt_1")).toEqual(current);
    expect(await db.finishWebhookEventProcessing("stripe", "evt_1", second.lease.token)).toBe(true);
    expect(await db.failWebhookEventProcessing("stripe", "evt_1", first.lease.token, {})).toBe(false);
    expect(await db.beginWebhookEventProcessing("stripe", "evt_1", {})).toEqual({ kind: "processed" });
    expect(records.get("webhookEvents/stripe:evt_1")?.status).toBe("processed");
  });

  it("recovers an owned failed event with a new token", async () => {
    const db = await import("./firestore");
    const claim = await db.beginWebhookEventProcessing("printful", "evt_1", {});
    if (claim.kind !== "claimed") throw new Error("Expected claim");
    expect(await db.failWebhookEventProcessing("printful", "evt_1", claim.lease.token, { type: "Error", message: "retry" })).toBe(true);
    const retry = await db.beginWebhookEventProcessing("printful", "evt_1", {});
    expect(retry).toMatchObject({ kind: "claimed" });
    if (retry.kind === "claimed") expect(retry.lease.token).not.toBe(claim.lease.token);
  });

  it("preserves legacy completions and applies the TTL to legacy processing", async () => {
    const db = await import("./firestore");
    records.set("webhookEvents/stripe:old_done", { processedAt: Timestamp.fromMillis(1) });
    expect(await db.beginWebhookEventProcessing("stripe", "old_done", {})).toEqual({ kind: "processed" });
    records.set("webhookEvents/stripe:old_busy", { status: "processing", updatedAt: Timestamp.fromMillis(1_000_000) });
    expect(await db.beginWebhookEventProcessing("stripe", "old_busy", {})).toEqual({ kind: "busy", retryAfterSeconds: 120 });
    vi.advanceTimersByTime(120_000);
    expect(await db.beginWebhookEventProcessing("stripe", "old_busy", {})).toMatchObject({ kind: "claimed" });
  });

  it("makes different event owners compete for one shipped order lease", async () => {
    const db = await import("./firestore");
    records.set("orders/order_1", { id: "order_1", status: "shipped", updatedAt: "old" });
    expect(await db.beginWebhookEventProcessing("stripe", "evt_a", {})).toMatchObject({ kind: "claimed" });
    expect(await db.beginWebhookEventProcessing("stripe", "evt_b", {})).toMatchObject({ kind: "claimed" });
    const results = await Promise.all([db.claimOrderProcessing("order_1"), db.claimOrderProcessing("order_1")]);
    expect(results.map((result) => result.kind)).toEqual(["claimed", "busy"]);
    expect(results[0]).toMatchObject({ value: { status: "shipped" } });
    expect(await db.claimOrderProcessing("absent")).toEqual({ kind: "missing" });
  });

  it("quarantines malformed legacy event ownership before allowing recovery", async () => {
    const db = await import("./firestore");
    records.set("webhookEvents/stripe:broken", { status: "processing", updatedAt: "bad" });
    await expect(db.beginWebhookEventProcessing("stripe", "broken", {})).rejects.toMatchObject({ retryAfterSeconds: 120 });
    expect(records.get("webhookEvents/stripe:broken")).toMatchObject({ status: "failed", error: { type: "MalformedProcessingLease" } });
    expect(await db.beginWebhookEventProcessing("stripe", "broken", {})).toEqual({ kind: "busy", retryAfterSeconds: 120 });
    vi.advanceTimersByTime(120_000);
    expect(await db.beginWebhookEventProcessing("stripe", "broken", {})).toMatchObject({ kind: "claimed" });
  });

  it("quarantines a malformed order lease without changing business state", async () => {
    const db = await import("./firestore");
    records.set("orders/order_1", { id: "order_1", status: "shipped", error: { type: "Existing", message: "preserve" }, orderProcessingLease: { token: "old" } });
    await expect(db.claimOrderProcessing("order_1")).rejects.toMatchObject({ retryAfterSeconds: 120 });
    expect(records.get("orders/order_1")).toMatchObject({ status: "shipped", error: { type: "Existing", message: "preserve" } });
    expect(await db.claimOrderProcessing("order_1")).toEqual({ kind: "busy", retryAfterSeconds: 120 });
    vi.advanceTimersByTime(120_000);
    expect(await db.claimOrderProcessing("order_1")).toMatchObject({ kind: "claimed" });
  });

  it("fences stale renew, update and release from a replacement order owner", async () => {
    const db = await import("./firestore");
    records.set("orders/order_1", { id: "order_1", status: "paid", updatedAt: "old" });
    const first = await db.claimOrderProcessing("order_1");
    if (first.kind !== "claimed") throw new Error("Expected claim");
    vi.advanceTimersByTime(120_000);
    expect(await db.renewOrderProcessing("order_1", first.lease.token)).toBe(false);
    expect(await db.updateClaimedOrder("order_1", first.lease.token, { status: "failed" })).toBe(false);
    expect(await db.releaseOrderProcessing("order_1", first.lease.token)).toBe(false);
    const second = await db.claimOrderProcessing("order_1");
    if (second.kind !== "claimed") throw new Error("Expected recovery claim");
    const current = { ...records.get("orders/order_1") };
    expect(await db.renewOrderProcessing("order_1", first.lease.token)).toBe(false);
    expect(await db.updateClaimedOrder("order_1", first.lease.token, { status: "failed" })).toBe(false);
    expect(await db.releaseOrderProcessing("order_1", first.lease.token)).toBe(false);
    expect(records.get("orders/order_1")).toEqual(current);
    vi.advanceTimersByTime(30_000);
    expect(await db.renewOrderProcessing("order_1", second.lease.token)).toBe(true);
    expect(records.get("orders/order_1")?.orderProcessingLease).toMatchObject({ expiresAtMs: 1_270_000 });
    expect(await db.updateClaimedOrder("order_1", second.lease.token, { status: "shipped" })).toBe(true);
    expect(records.get("orders/order_1")?.status).toBe("shipped");
    expect(await db.releaseOrderProcessing("order_1", second.lease.token)).toBe(true);
    expect(records.get("orders/order_1")).not.toHaveProperty("orderProcessingLease");
  });

  it("uses the final transaction attempt's clock and the same generated token", async () => {
    const db = await import("./firestore");
    const tokens: string[] = [];
    mocks.runTransaction.mockImplementationOnce(async (callback) => {
      const transaction = {
        get: async () => ({ exists: false, data: () => undefined }),
        set: (_ref: unknown, patch: { lease?: { token: string } }) => { tokens.push(patch.lease?.token || "missing"); }
      };
      await callback(transaction);
      vi.advanceTimersByTime(10_000);
      return callback(transaction);
    });
    const result = await db.beginWebhookEventProcessing("stripe", "evt_retry", {});
    expect(result).toMatchObject({ kind: "claimed", lease: { expiresAtMs: 1_130_000 } });
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toBe(tokens[1]);
  });
});
