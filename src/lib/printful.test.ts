import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mixedPayload, safePayload, syncDtfFixture } from "./__fixtures__/printful-shipping-risk";
import type { OrderItem, Recipient } from "./types";

describe("Printful shipment customs evidence", () => {
  const recipient: Recipient = { name: "Test", email: "test@example.com", address1: "Test 1", address2: "Unit 2", city: "Madrid", countryCode: "ES", zip: "28014" };
  const item: OrderItem = { productId: "468682936", productName: "Tee", syncVariantId: 5489215132, variantId: 15114, variantName: "S", quantity: 1, unitAmount: 3999, currency: "usd" };
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  beforeEach(() => { vi.resetModules(); vi.stubEnv("PRINTFUL_API_TOKEN", "test-token"); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("reads every shipment in the v2 data envelope", async () => {
    const { readShippingRiskRates } = await import("./printful-shipping-risk");
    expect(readShippingRiskRates(mixedPayload)[0]).toMatchObject({ id: "STANDARD", currency: "usd", valid: true });
    expect(readShippingRiskRates(mixedPayload)[0].shipments.map(s => s.customsFeesPossible)).toEqual([false, true]);
  });
  it.each([undefined, null, "false", 0])("never converts missing or mistyped customs signals to false: %s", async flag => {
    const { readShippingRiskRates } = await import("./printful-shipping-risk");
    const payload: { data: { shipments: { customs_fees_possible: unknown }[] }[] } = structuredClone(safePayload);
    payload.data[0].shipments[0].customs_fees_possible = flag;
    expect(readShippingRiskRates(payload)[0].shipments[0].customsFeesPossible).toBeNull();
  });
  it("rejects invalid envelopes and marks malformed methods unverified", async () => {
    const { readShippingRiskRates } = await import("./printful-shipping-risk");
    expect(() => readShippingRiskRates({ result: [] })).toThrow();
    for (const rate of [null, {}, { shipping: "STANDARD", currency: "USD", shipments: [] }]) {
      expect(readShippingRiskRates({ data: [rate] })[0].valid).toBe(false);
    }
  });
  it("quotes exact sync variants with verified front_dtf placements, full address and complete cart", async () => {
    const second = { ...item, productId: "468513582", syncVariantId: 5488661812, quantity: 2 };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(response(
      url.includes("/v2/") ? safePayload : url.endsWith("468513582")
        ? { result: { sync_product: { id: 468513582 }, sync_variants: [{ id: 5488661812, variant_id: 15114, files: [{ type: "front_dtf" }] }] } }
        : syncDtfFixture)));
    vi.stubGlobal("fetch", fetchMock);
    const { getShippingRiskRates } = await import("./printful");
    await getShippingRiskRates(recipient, [item, { ...item, quantity: 3 }, second]);
    expect(fetchMock.mock.calls.filter(([url]) => !url.includes("/v2/"))).toHaveLength(2);
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/v2/shipping-rates"))![1].body);
    expect(body).toMatchObject({ currency: "USD", recipient: { address2: "Unit 2", country_code: "ES" } });
    expect(body.order_items).toEqual([1, 3, 2].map(quantity => ({ source: "catalog", catalog_variant_id: 15114, quantity, placements: [{ placement: "front_dtf", technique: "dtfilm" }] })));
  });
  it.each(["identity", "missing", "back", "dtg", "empty", "duplicate", "ignored"])("rejects unsupported or mismatched sync configuration: %s", async kind => {
    const metadata: { result: { sync_product: { id: number }; sync_variants: { id: number; variant_id: number; files: { type: string }[]; is_ignored?: boolean }[] } } = structuredClone(syncDtfFixture);
    const v = metadata.result.sync_variants[0];
    if (kind === "identity") v.variant_id = 42;
    if (kind === "missing") v.id = 1;
    if (kind === "back") v.files.push({ type: "back_dtf" });
    if (kind === "dtg") v.files[0].type = "front";
    if (kind === "empty") v.files = [{ type: "preview" }];
    if (kind === "duplicate") metadata.result.sync_variants.push(v);
    if (kind === "ignored") v.is_ignored = true;
    const fetchMock = vi.fn().mockResolvedValue(response(metadata));
    vi.stubGlobal("fetch", fetchMock);
    const { getShippingRiskRates } = await import("./printful");
    await expect(getShippingRiskRates(recipient, [item])).rejects.toThrow();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/v2/"))).toBe(false);
  });
  it.each([429, 500, 503])("propagates failed risk checks HTTP %s without retry", async status => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(syncDtfFixture)).mockResolvedValueOnce(response({}, status));
    vi.stubGlobal("fetch", fetchMock);
    const { getShippingRiskRates } = await import("./printful");
    await expect(getShippingRiskRates(recipient, [item])).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects unreadable successful JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")));
    const { getShippingRiskRates } = await import("./printful");
    await expect(getShippingRiskRates(recipient, [item])).rejects.toThrow();
  });
  it("bounds metadata concurrency to three and shares a global 20 second deadline", async () => {
    vi.useFakeTimers();
    let active = 0, maximum = 0;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      active++; maximum = Math.max(maximum, active);
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => { active--; reject(new DOMException("Aborted", "AbortError")); }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getShippingRiskRates } = await import("./printful");
    const pending = getShippingRiskRates(recipient, Array.from({ length: 5 }, (_, i) => ({ ...item, productId: String(100 + i) })));
    const assertion = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(maximum).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Printful order recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PRINTFUL_API_TOKEN", "test-token");
    vi.stubEnv("PRINTFUL_STORE_ID", "18536834");
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it.each([429, 500, 503])("propagates unavailable lookup HTTP %s instead of permitting creation", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Unavailable" } }), { status })));
    const { findPrintfulOrderByExternalId } = await import("./printful");
    await expect(findPrintfulOrderByExternalId("order1")).rejects.toMatchObject({ status });
  });

  it.each([{}, { result: null }, { result: { id: "123", status: "draft" } }, { result: { id: 123 } }])("never treats malformed successful lookup as not-found %#", async (payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const { findPrintfulOrderByExternalId } = await import("./printful");
    await expect(findPrintfulOrderByExternalId("order1")).rejects.toMatchObject({ name: "PrintfulApiError", status: 502 });
  });

  it("recognizes structured HTTP400 external-ID conflicts without making all validation errors temporary", async () => {
    const { PrintfulApiError } = await import("./printful");
    const duplicate = new PrintfulApiError("Rejected", 400, { error: { reason: "EXTERNAL_ID_IN_USE", code: "OR-13" } });
    expect(duplicate.isDuplicateExternalId).toBe(true);
    expect(new PrintfulApiError("Rejected", 400, { error: { code: "OR-1", message: "Invalid address" } }).isDuplicateExternalId).toBe(false);
  });

  it.each(["headers", "body"])("aborts Printful after 20 seconds while waiting for %s", async (phase) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => {
      signal = init.signal;
      const pending = () => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError"))));
      return phase === "headers" ? pending() : Promise.resolve({ ok: true, status: 200, json: pending });
    }));
    const { findPrintfulOrderByExternalId } = await import("./printful");
    let failure: unknown;
    const request = findPrintfulOrderByExternalId("order1").catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(19999);
    expect(failure).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(failure).toMatchObject({ name: "AbortError" });
    await request;
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

  it("adds the webhook secret without replacing existing query parameters", async () => {
    const { appendWebhookSecret } = await import("./printful");

    expect(appendWebhookSecret("https://store.example/api/webhooks/printful?source=admin", "strong-test-secret")).toBe(
      "https://store.example/api/webhooks/printful?source=admin&secret=strong-test-secret"
    );
  });

  it("requests shipping rates with the English storefront locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, result: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getShippingRates } = await import("./printful");
    await getShippingRates(
      {
        name: "Ada Customer",
        email: "ada@example.com",
        address1: "1 Test Street",
        city: "New York",
        stateCode: "NY",
        countryCode: "US",
        zip: "10001"
      },
      [
        {
          productId: "453103125",
          productName: "Test Shirt",
          syncVariantId: 5419713597,
          variantId: 12634,
          variantName: "Test Shirt / Maroon / S",
          quantity: 1,
          unitAmount: 2499,
          currency: "usd"
        }
      ]
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      currency: "USD",
      locale: "en_US"
    });
  });
});
