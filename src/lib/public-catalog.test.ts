import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCatalogProducts } from "./firestore";
import { getPublicCatalog } from "./public-catalog";
import type { CatalogProduct } from "./types";

vi.mock("./firestore", () => ({ listCatalogProducts: vi.fn() }));

const product: CatalogProduct = {
  id: "468682936",
  syncProductId: 468682936,
  name: "Falling apart",
  storefrontImage: "https://example.com/falling-apart.webp",
  variants: [{
    syncVariantId: 1,
    variantId: 2,
    name: "Black / M",
    size: "M",
    color: "Black",
    retailPrice: "39.99",
    currency: "USD",
    availabilityStatus: "active"
  }],
  updatedAt: "2026-09-21T00:00:00.000Z"
};

describe("getPublicCatalog", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns public products when the catalog is available", async () => {
    vi.mocked(listCatalogProducts).mockResolvedValue([product]);

    await expect(getPublicCatalog()).resolves.toEqual({ products: [product], status: "available" });
  });

  it("keeps a successful empty catalog distinct from a read failure", async () => {
    vi.mocked(listCatalogProducts).mockResolvedValue([]);

    await expect(getPublicCatalog()).resolves.toEqual({ products: [], status: "available" });
  });

  it("does not expose a catalog read error", async () => {
    vi.mocked(listCatalogProducts).mockRejectedValue(new Error("missing FIREBASE_PROJECT_ID"));

    await expect(getPublicCatalog()).resolves.toEqual({ products: [], status: "unavailable" });
  });
});
