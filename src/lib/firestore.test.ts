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

const alerts = vi.hoisted(() => ({ observe: vi.fn(), enabled: false }));
vi.mock("./operational-alerts/observe", () => ({ observeCommittedChange: alerts.observe }));
vi.mock("./operational-alerts/config", () => ({ readAlertConfig: () => ({ enabled: alerts.enabled }), canRunAlerts: (config: { enabled: boolean }) => config.enabled }));

describe("committed operational observations", () => {
  const records = new Map<string, Record<string, unknown>>();
  let inTransaction = false;
  let replay = false;
  let readsFail = false;
  let concurrent = false;
  let revision = 0;
  const versions = new Map<string, number>();
  const version = (number: number) => Timestamp.fromMillis(number);
  const snapshot = (path: string) => {
    const data = records.get(path); const captured = data ? { ...data } : undefined;
    return { id: path.split("/").at(-1), exists: records.has(path), data: () => captured, updateTime: version(versions.get(path) ?? 0) };
  };
  const apply = (path: string, patch: Record<string, unknown>, merge = false) => {
    const next = merge ? { ...records.get(path) } : {};
    for (const [key, value] of Object.entries(patch)) {
      if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[key];
      else if (value instanceof FieldValue && value.isEqual(FieldValue.serverTimestamp())) next[key] = Timestamp.now();
      else next[key] = value;
    }
    records.set(path, next); versions.set(path, ++revision);
    return { writeTime: version(revision) };
  };
  const ref = (path: string) => ({ path, id: path.split("/").at(-1),
    get: async () => { if (readsFail) throw new Error("private read error"); return snapshot(path); },
    set: async (patch: Record<string, unknown>, options?: { merge: boolean }) => {
      const result = apply(path, patch, options?.merge);
      if (concurrent) apply(path, { status: "shipped", updatedAt: new Date(Date.now() + 1).toISOString() }, true);
      return result;
    }
  });
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    records.clear(); versions.clear(); revision = 0; replay = false; readsFail = false; concurrent = false; alerts.enabled = true;
    alerts.observe.mockResolvedValue(undefined);
    mocks.collection.mockImplementation((name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      add: async (data: Record<string, unknown>) => { apply(`${name}/run`, data); return ref(`${name}/run`); },
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [...records].filter(([path]) => path.startsWith(`${name}/`)).map(([path]) => snapshot(path)) }) }) })
    }));
    mocks.runTransaction.mockImplementation(async callback => {
      const execute = async (commit: boolean) => {
        const writes: Array<() => void> = []; inTransaction = true;
        try {
          const result = await callback({ get: async (reference: { path: string }) => snapshot(reference.path), set: (reference: { path: string }, data: Record<string, unknown>, options?: { merge: boolean }) => writes.push(() => { apply(reference.path, data, options?.merge); }) });
          if (commit) writes.forEach(write => write());
          return result;
        } finally { inTransaction = false; }
      };
      if (replay) { await execute(false); vi.advanceTimersByTime(1); }
      return execute(true);
    });
  });
  afterEach(() => { alerts.enabled = false; vi.useRealTimers(); });
  const seedOrder = () => records.set("orders/one", { status: "paid", updatedAt: new Date(900000).toISOString(), orderProcessingLease: { token: "owner", expiresAtMs: 1120000 } });
  it("observes only the committed transaction attempt and preserves fulfillment result with a broken observer", async () => {
    const db = await import("./firestore"); seedOrder(); replay = true;
    const observedContexts: unknown[] = [];
    alerts.observe.mockImplementation(async () => { observedContexts.push({ inTransaction, status: records.get("orders/one")?.status }); throw new Error("broken alert"); });
    expect(await db.completeClaimedFulfillment("one", "owner", { status: "failed" })).toBe(true);
    expect(alerts.observe).toHaveBeenCalledOnce();
    expect(observedContexts).toEqual([{ inTransaction: false, status: "failed" }]);
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ source: { status: "failed", sourceVersionMs: 1000001 }, previous: { status: "paid" } });
    expect(await db.completeClaimedFulfillment("one", "lost", { status: "shipped" })).toBe(false);
    expect(alerts.observe).toHaveBeenCalledOnce();
  });
  it("projects deleted review fields as resolved without observing lease maintenance", async () => {
    const db = await import("./firestore"); seedOrder();
    records.get("orders/one")!.refundReviewReason = "private review";
    expect(await db.updateClaimedOrder("one", "owner", { refundReviewReason: FieldValue.delete() })).toBe(true);
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ source: { refundReview: false, readable: true }, previous: { refundReview: true } });
    await db.renewOrderProcessing("one", "owner"); await db.releaseOrderProcessing("one", "owner");
    expect(alerts.observe).toHaveBeenCalledOnce();
  });
  it("observes blocked and recovered jobs only after owned writes", async () => {
    const db = await import("./firestore");
    records.set("emailJobs/job", { status: "processing", updatedAt: new Date(900000).toISOString(), lease: { token: "owner", expiresAtMs: 1120000 } });
    expect(await db.finishEmailJob("job", "lost", "blocked")).toBe(false); expect(alerts.observe).not.toHaveBeenCalled();
    expect(await db.finishEmailJob("job", "owner", "blocked")).toBe(true);
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ source: { kind: "email", status: "blocked", readable: true, leaseExpiresAtMs: null } });
    records.set("emailJobs/job", { ...records.get("emailJobs/job"), status: "processing", lease: { token: "new", expiresAtMs: 1120000 } });
    vi.advanceTimersByTime(1); await db.finishEmailJob("job", "new", "accepted");
    expect(alerts.observe.mock.calls[1][0]).toMatchObject({ source: { status: "accepted" } });
  });
  it("observes webhook failures, resolutions and persisted quarantine but not ordinary busy results", async () => {
    const db = await import("./firestore");
    const claim = await db.beginWebhookEventProcessing("stripe", "event", {});
    if (claim.kind !== "claimed") throw new Error("claim required");
    expect(await db.beginWebhookEventProcessing("stripe", "event", {})).toMatchObject({ kind: "busy" }); expect(alerts.observe).not.toHaveBeenCalled();
    await db.failWebhookEventProcessing("stripe", "event", claim.lease.token, { type: "Error", message: "private" });
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ source: { status: "failed", errorCode: "processing_failed", leaseExpiresAtMs: null } });
    const retry = await db.beginWebhookEventProcessing("stripe", "event", {}); if (retry.kind !== "claimed") throw new Error("claim required");
    vi.advanceTimersByTime(1); await db.finishWebhookEventProcessing("stripe", "event", retry.lease.token);
    expect(alerts.observe.mock.calls[1][0]).toMatchObject({ source: { status: "processed", errorCode: "none" } });
    records.set("webhookEvents/stripe:bad", { status: "processing", lease: { broken: true } });
    await expect(db.beginWebhookEventProcessing("stripe", "bad", {})).rejects.toMatchObject({ retryAfterSeconds: 120 });
    expect(alerts.observe.mock.calls[2][0]).toMatchObject({ source: { status: "failed", errorCode: "malformed_lease" } });
  });
  it("preserves simple write results when reads fail and observes authoritative concurrent state conservatively", async () => {
    const db = await import("./firestore"); seedOrder(); readsFail = true;
    await expect(db.updateOrder("one", { status: "failed" })).resolves.toBeUndefined();
    expect(records.get("orders/one")?.status).toBe("failed"); expect(alerts.observe).not.toHaveBeenCalled();
    readsFail = false; concurrent = true;
    await db.updateOrder("one", { status: "manual_review" });
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ previous: "unknown", source: { status: "shipped" } });
  });
  it("observes creation and simple updates, and keeps disabled writes free of extra reads", async () => {
    const db = await import("./firestore");
    await db.createOrder({ id: "one", status: "failed", updatedAt: new Date().toISOString() } as StoreOrder);
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ previous: null, source: { status: "failed" } });
    vi.advanceTimersByTime(1); await db.updateOrder("one", { status: "shipped" });
    expect(alerts.observe.mock.calls[1][0]).toMatchObject({ previous: { status: "failed" }, source: { status: "shipped" } });
    alerts.enabled = false; readsFail = true; alerts.observe.mockClear();
    await db.updateOrder("one", { status: "paid" }); expect(alerts.observe).not.toHaveBeenCalled();
  });
  it("bounds a stalled pre-read and marks the first observed transition unknown", async () => {
    const db = await import("./firestore"); seedOrder(); const reference = ref("orders/one");
    const read = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockImplementation(() => reference.get());
    mocks.collection.mockImplementation(() => ({ doc: () => ({ ...reference, get: read }) }));
    const write = db.updateOrder("one", { status: "failed" });
    await vi.advanceTimersByTimeAsync(500); await write;
    expect(records.get("orders/one")?.status).toBe("failed");
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ previous: "unknown", source: { status: "failed" } });
  });
  it("performs zero extra source reads when alerts are disabled", async () => {
    const db = await import("./firestore"); seedOrder(); alerts.enabled = false;
    const reference = ref("orders/one"); const read = vi.fn(() => reference.get());
    mocks.collection.mockImplementation(() => ({ doc: () => ({ ...reference, get: read }) }));
    await db.updateOrder("one", { status: "failed" });
    expect(read).not.toHaveBeenCalled(); expect(alerts.observe).not.toHaveBeenCalled();
  });
  it("uses the stable catalog source and resolved server timestamp for sync outcomes", async () => {
    const db = await import("./firestore"); await db.createSyncRun({ status: "success" });
    expect(alerts.observe.mock.calls[0][0]).toMatchObject({ source: { ref: { kind: "catalog", id: "catalog" }, status: "success", sourceVersionMs: 1000000 } });
    vi.advanceTimersByTime(1); await db.createSyncRun({ status: "failed", error: { message: "private" } });
    expect(alerts.observe.mock.calls[1][0]).toMatchObject({ source: { status: "failed" } });
    expect(JSON.stringify(alerts.observe.mock.calls)).not.toContain("private");
  });
});

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

  it("renews only a live event owner and never revives expired or replaced tokens", async () => {
    const db = await import("./firestore");
    expect(db).toHaveProperty("renewWebhookEventProcessing");
    const first = await db.beginWebhookEventProcessing("stripe", "evt_renew", {});
    if (first.kind !== "claimed") throw new Error("Expected claim");
    vi.advanceTimersByTime(100000);
    expect(await db.renewWebhookEventProcessing("stripe", "evt_renew", first.lease.token)).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(await db.beginWebhookEventProcessing("stripe", "evt_renew", {})).toMatchObject({ kind: "busy" });
    vi.advanceTimersByTime(100000);
    expect(await db.renewWebhookEventProcessing("stripe", "evt_renew", first.lease.token)).toBe(false);
    expect(await db.finishWebhookEventProcessing("stripe", "evt_renew", first.lease.token)).toBe(false);
    const second = await db.beginWebhookEventProcessing("stripe", "evt_renew", {});
    if (second.kind !== "claimed") throw new Error("Expected replacement");
    expect(await db.renewWebhookEventProcessing("stripe", "evt_renew", first.lease.token)).toBe(false);
    expect(await db.finishWebhookEventProcessing("stripe", "evt_renew", second.lease.token)).toBe(true);
    const completed = records.get("webhookEvents/stripe:evt_renew");
    expect(await db.renewWebhookEventProcessing("stripe", "evt_renew", second.lease.token)).toBe(false);
    expect(await db.failWebhookEventProcessing("stripe", "evt_renew", first.lease.token, {})).toBe(false);
    expect(records.get("webhookEvents/stripe:evt_renew")).toEqual(completed);
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
