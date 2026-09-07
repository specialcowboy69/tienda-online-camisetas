import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Printful order recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PRINTFUL_API_TOKEN", "test-token");
    vi.stubEnv("PRINTFUL_STORE_ID", "18536834");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("recovers an order that Printful already created", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          result: { id: 123, status: "draft", external_id: "b4b730b72e9e4ff8a3b2075af39b211d" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { findPrintfulOrderByExternalId } = await import("./printful");
    await expect(findPrintfulOrderByExternalId("b4b730b72e9e4ff8a3b2075af39b211d")).resolves.toMatchObject({ id: 123, status: "draft" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.printful.com/orders/@b4b730b72e9e4ff8a3b2075af39b211d",
      expect.any(Object)
    );
  });

  it("does not hide unrelated Printful validation errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 404, error: { message: "Not found" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { findPrintfulOrderByExternalId } = await import("./printful");
    await expect(findPrintfulOrderByExternalId("missing-order")).resolves.toBeNull();
  });

  it("normalizes legacy UUID order IDs before sending them to Printful", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          result: { id: 123, status: "draft", external_id: "737c2156ef584a17a5736185195dd42b" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createPrintfulOrder } = await import("./printful");
    await createPrintfulOrder({
      id: "737c2156-ef58-4a17-a573-6185195dd42b",
      status: "paid",
      recipient: {
        name: "Test Buyer",
        email: "buyer@example.com",
        address1: "Test Street 1",
        city: "Madrid",
        countryCode: "ES",
        zip: "28001"
      },
      items: [
        {
          productId: "453103125",
          productName: "Test Shirt",
          syncVariantId: 5419713597,
          variantId: 12634,
          variantName: "Test Shirt / S",
          quantity: 1,
          unitAmount: 2499,
          currency: "eur"
        }
      ],
      shippingRate: { id: "STANDARD", name: "Standard", rate: "4.29", currency: "EUR" },
      totals: { subtotal: 2499, shipping: 429, total: 2928, currency: "eur" },
      createdAt: "2026-07-31T16:11:53.612Z",
      updatedAt: "2026-07-31T16:11:53.612Z"
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.external_id).toBe("737c2156ef584a17a5736185195dd42b");
  });

  it("syncs catalog variants in the configured store currency", async () => {
    vi.stubEnv("STORE_CURRENCY", "usd");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            result: [{ id: 101, external_id: "shirt-101", name: "Test Shirt", variants: 1, synced: 1, thumbnail_url: "https://example.com/shirt.png" }],
            paging: { total: 1, offset: 0, limit: 100 }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            result: {
              sync_product: { id: 101, external_id: "shirt-101", name: "Test Shirt", variants: 1, synced: 1, thumbnail_url: "https://example.com/shirt.png" },
              sync_variants: [
                {
                  id: 201,
                  variant_id: 301,
                  name: "Test Shirt / L",
                  retail_price: "25.50",
                  currency: "EUR",
                  availability_status: "active"
                }
              ]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchPrintfulCatalog } = await import("./printful");
    const products = await fetchPrintfulCatalog();

    expect(products[0].variants[0]).toMatchObject({
      retailPrice: "25.50",
      currency: "usd"
    });
  });

  it("adds the webhook secret without replacing existing query parameters", async () => {
    const { appendWebhookSecret } = await import("./printful");

    expect(appendWebhookSecret("https://store.example/api/webhooks/printful?source=admin", "strong-test-secret")).toBe(
      "https://store.example/api/webhooks/printful?source=admin&secret=strong-test-secret"
    );
  });
});
