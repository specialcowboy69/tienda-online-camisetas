import { beforeEach, describe, expect, it, vi } from "vitest";
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

    await expect(beginWebhookEventProcessing("stripe", "evt-test", payload)).resolves.toBe(true);

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

    await expect(beginWebhookEventProcessing("stripe", "evt-processed", {})).resolves.toBe(false);

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
