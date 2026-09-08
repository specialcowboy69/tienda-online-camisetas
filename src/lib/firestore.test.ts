import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  docs: [] as Array<{ data: () => unknown }>,
  orderBy: vi.fn()
}));

vi.mock("./firebase-admin", () => ({
  getDb: () => ({
    collection: vi.fn(() => ({
      orderBy: mocks.orderBy
    }))
  })
}));

describe("listCatalogProducts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.docs = [];
    mocks.orderBy.mockReturnValue({
      get: vi.fn(async () => ({ docs: mocks.docs }))
    });
  });

  it("excludes ignored products from the public catalog", async () => {
    mocks.docs = [
      {
        data: () => ({
          id: "active",
          syncProductId: 1,
          name: "Active product",
          variants: [],
          updatedAt: "2026-09-07T00:00:00.000Z"
        })
      },
      {
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
});
