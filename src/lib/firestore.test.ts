import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; ref: { path: string }; data: () => unknown }>,
  orderBy: vi.fn(),
  collectionGet: vi.fn(),
  doc: vi.fn((id: string) => ({ id, path: `products/${id}` })),
  batchSet: vi.fn(),
  batchCommit: vi.fn()
}));

vi.mock("./firebase-admin", () => ({
  getDb: () => ({
    batch: vi.fn(() => ({
      set: mocks.batchSet,
      commit: mocks.batchCommit
    })),
    collection: vi.fn(() => ({
      orderBy: mocks.orderBy,
      get: mocks.collectionGet,
      doc: mocks.doc
    }))
  })
}));

describe("Firestore catalog products", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.docs = [];
    mocks.collectionGet.mockResolvedValue({ docs: mocks.docs });
    mocks.doc.mockImplementation((id: string) => ({ id, path: `products/${id}` }));
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
});
