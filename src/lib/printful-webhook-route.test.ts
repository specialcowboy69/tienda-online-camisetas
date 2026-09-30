import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  beginWebhookEventProcessing: vi.fn(),
  finishWebhookEventProcessing: vi.fn(), failWebhookEventProcessing: vi.fn(), markCatalogProductDeleted: vi.fn(),
  configurePrintfulWebhook: vi.fn(),
  isAdminRequest: vi.fn(),
  listCatalogProducts: vi.fn(),
  order: null as import("./types").StoreOrder | null, jobs: [] as import("./types").EmailJob[], dispatch: vi.fn(), claimOrder: vi.fn(), writeOrder: vi.fn(), applyShipment: vi.fn(), releaseOrder: vi.fn(),
  webhookSecret: "strong-test-secret" as string | undefined
}));

vi.mock("@/lib/auth", () => ({
  isAdminRequest: mocks.isAdminRequest
}));

vi.mock("@/lib/env", () => ({
  env: {
    get PRINTFUL_WEBHOOK_SECRET() {
      return mocks.webhookSecret;
    }
  },
  getBaseUrl: () => "https://store.example"
}));

vi.mock("@/lib/email-jobs", async (importOriginal) => ({ ...await importOriginal<typeof import("./email-jobs")>(), processEmailJob: mocks.dispatch }));
vi.mock("@/lib/email", async (importOriginal) => ({ ...await importOriginal<typeof import("./email")>(), sendShipmentEmail: vi.fn() }));

vi.mock("@/lib/firestore", () => ({
  beginWebhookEventProcessing: mocks.beginWebhookEventProcessing,
  failWebhookEventProcessing: mocks.failWebhookEventProcessing,
  finishWebhookEventProcessing: mocks.finishWebhookEventProcessing,
  findOrderByPrintfulExternalId: vi.fn(),
  getOrder: async () => mocks.order,
  claimOrderProcessing: mocks.claimOrder,
  updateClaimedOrder: mocks.writeOrder,
  applyClaimedShipment: mocks.applyShipment,
  releaseOrderProcessing: mocks.releaseOrder,
  listOrderEmailJobs: async () => mocks.jobs,
  listCatalogProducts: mocks.listCatalogProducts,
  markCatalogProductDeleted: mocks.markCatalogProductDeleted,
  saveCatalogProducts: vi.fn(),
  updateOrderStatus: async (_id: string, status: import("./types").OrderStatus, patch: object) => { mocks.order = { ...mocks.order!, ...patch, status }; }
}));


vi.mock("@/lib/printful", () => ({
  appendWebhookSecret: (url: string, secret?: string) => {
    if (!secret) {
      return url;
    }

    const parsed = new URL(url);
    parsed.searchParams.set("secret", secret);
    return parsed.toString();
  },
  configurePrintfulWebhook: mocks.configurePrintfulWebhook,
  fetchPrintfulCatalog: vi.fn()
}));

vi.mock("@/lib/printful-webhook", async (importOriginal) => ({ ...await importOriginal<typeof import("./printful-webhook")>(), isPrintfulWebhookSecretValid: (value: string | null) => value === "strong-test-secret", parsePrintfulWebhookPayload: (input: unknown) => input }));

describe("Printful webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PRINTFUL_WEBHOOK_SECRET", "strong-test-secret");
    mocks.webhookSecret = "strong-test-secret";
    mocks.finishWebhookEventProcessing.mockResolvedValue(true);
    mocks.failWebhookEventProcessing.mockResolvedValue(true);
    mocks.order = null; mocks.jobs = []; mocks.dispatch.mockResolvedValue("accepted"); mocks.releaseOrder.mockResolvedValue(true);
    mocks.claimOrder.mockImplementation(async () => ({ kind: "claimed", value: mocks.order, lease: { token: "order-owner", expiresAtMs: Date.now() + 120000 } }));
    mocks.writeOrder.mockImplementation(async (_id, _token, patch) => { mocks.order = { ...mocks.order!, ...patch }; return true; });
    mocks.applyShipment.mockImplementation(async (id, token, patch, job) => { await mocks.writeOrder(id, token, patch); if (job && !mocks.jobs.some((item) => item.id === job.id)) mocks.jobs.push(job); return true; });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an unauthorized webhook before reading its body", async () => {
    const { POST } = await import("../app/api/webhooks/printful/route");
    const request = new NextRequest("https://store.example/api/webhooks/printful");
    const jsonSpy = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid webhook secret from the query parameter", async () => {
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "processed" });
    const { POST } = await import("../app/api/webhooks/printful/route");
    const request = new NextRequest("https://store.example/api/webhooks/printful?secret=strong-test-secret", {
      method: "POST",
      body: JSON.stringify({ type: "order_created", created: 123, retries: 0, store: 18536834 })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
  });

  it("accepts a valid webhook secret from the request header", async () => {
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "processed" });
    const { POST } = await import("../app/api/webhooks/printful/route");
    const request = new NextRequest("https://store.example/api/webhooks/printful", {
      method: "POST",
      headers: { "x-printful-webhook-secret": "strong-test-secret" },
      body: JSON.stringify({ type: "order_created", created: 123, retries: 0, store: 18536834 })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
  });

  it("returns only the base webhook URL after registration", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://store.example");
    mocks.isAdminRequest.mockReturnValue(true);
    mocks.listCatalogProducts.mockResolvedValue([{ syncProductId: 123 }]);
    mocks.configurePrintfulWebhook.mockResolvedValue({ url: "https://store.example/api/webhooks/printful?secret=strong-test-secret" });
    const { POST } = await import("../app/api/admin/printful/webhook/route");

    const response = await POST(new NextRequest("https://store.example/api/admin/printful/webhook", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, url: "https://store.example/api/webhooks/printful" });
    expect(JSON.stringify(body)).not.toContain("strong-test-secret");
    expect(mocks.configurePrintfulWebhook).toHaveBeenCalledWith(
      "https://store.example/api/webhooks/printful?secret=strong-test-secret",
      [123]
    );
  });

  it("returns 503 and Retry-After for a busy Printful event", async () => {
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "busy", retryAfterSeconds: 23 });
    const { POST } = await import("../app/api/webhooks/printful/route");
    const response = await POST(new NextRequest("https://store.example/api/webhooks/printful?secret=strong-test-secret", {
      method: "POST", body: JSON.stringify({ type: "product_deleted", created: 123, store: 1, data: { sync_product: { id: 7 } } })
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(mocks.markCatalogProductDeleted).not.toHaveBeenCalled();
    expect(mocks.finishWebhookEventProcessing).not.toHaveBeenCalled();
  });

  it.each(["finish", "fail"])("returns retryable 503 after lost Printful %s ownership", async (operation) => {
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "claimed", value: null, lease: { token: "printful-owner", expiresAtMs: Date.now() + 120000 } });
    if (operation === "finish") mocks.finishWebhookEventProcessing.mockResolvedValue(false);
    else {
      mocks.markCatalogProductDeleted.mockRejectedValueOnce(new Error("work failed"));
      mocks.failWebhookEventProcessing.mockResolvedValue(false);
    }
    const { POST } = await import("../app/api/webhooks/printful/route");
    const response = await POST(new NextRequest("https://store.example/api/webhooks/printful?secret=strong-test-secret", {
      method: "POST", body: JSON.stringify({ type: "product_deleted", created: 123, store: 1, data: { sync_product: { id: 7 } } })
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    if (operation === "finish") expect(mocks.finishWebhookEventProcessing).toHaveBeenCalledWith("printful", "product_deleted:123:1:7", "printful-owner");
    expect(mocks.failWebhookEventProcessing).toHaveBeenCalledWith("printful", "product_deleted:123:1:7", "printful-owner", expect.anything());
  });

  it("refuses webhook registration when the signing secret is missing", async () => {
    mocks.webhookSecret = undefined;
    mocks.isAdminRequest.mockReturnValue(true);
    mocks.listCatalogProducts.mockResolvedValue([]);
    mocks.configurePrintfulWebhook.mockResolvedValue({});
    const { POST } = await import("../app/api/admin/printful/webhook/route");

    const response = await POST(new NextRequest("https://store.example/api/admin/printful/webhook", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "PRINTFUL_WEBHOOK_SECRET is not configured" });
  });

  async function ship(shipment: object, type = "package_shipped") {
    const { POST } = await import("../app/api/webhooks/printful/route");
    return POST(new NextRequest("https://store.example/api/webhooks/printful?secret=strong-test-secret", { method: "POST", body: JSON.stringify({ type, created: 123, retries: 0, store: 1, data: { order: { id: 7, external_id: "order1", status: "fulfilled" }, shipment } }) }));
  }
  function shipmentOrder() {
    mocks.beginWebhookEventProcessing.mockResolvedValue({ kind: "claimed", value: null, lease: { token: "event-owner", expiresAtMs: Date.now() + 120000 } });
    mocks.order = { id: "order1", status: "printful_confirmed", printfulOrderId: 7, emailPolicyVersion: 1, recipient: { name: "Ada", email: "ada@example.com", address1: "1 Main St", city: "Madrid", countryCode: "ES", zip: "28001" }, items: [], shippingRate: { id: "STANDARD", name: "Standard", rate: "0", currency: "eur" }, totals: { subtotal: 2000, shipping: 0, total: 2000, currency: "eur" }, createdAt: "today", updatedAt: "today" };
  }
  it("keeps two shipments in the same second distinct and their retries immutable", async () => {
    shipmentOrder(); expect((await ship({ id: 101, tracking_number: "first" })).status).toBe(200);
    expect((await ship({ id: 102, tracking_number: "second" })).status).toBe(200);
    expect(mocks.jobs).toHaveLength(2); expect(mocks.jobs[0].id).not.toBe(mocks.jobs[1].id);
    const first = structuredClone(mocks.jobs[0]); await ship({ id: 101, tracking_number: "changed" });
    expect(mocks.jobs).toHaveLength(2); expect(mocks.jobs[0]).toEqual(first);
    expect(mocks.beginWebhookEventProcessing.mock.calls[0][1]).not.toBe(mocks.beginWebhookEventProcessing.mock.calls[1][1]);
  });
  it("keeps email failure retryable while the shipment and job stay persisted", async () => {
    shipmentOrder(); mocks.dispatch.mockResolvedValue("retry"); const response = await ship({ id: 101 });
    expect(response.status).toBe(503); expect(mocks.order?.status).toBe("shipped"); expect(mocks.jobs).toHaveLength(1);
    expect(mocks.finishWebhookEventProcessing).not.toHaveBeenCalled();
  });
  it.each(["returned", "canceled", "manual_review", "refunded"] as const)("does not regress %s when a delayed shipment arrives", async (status) => {
    shipmentOrder(); mocks.order!.status = status; const response = await ship({ id: 101 });
    expect(response.status).toBe(200); expect(mocks.order?.status).toBe(status); expect(mocks.jobs).toHaveLength(0); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("uses stable tracking identity when shipment ID is absent and flags missing identities", async () => {
    shipmentOrder(); await ship({ carrier: "Carrier", tracking_number: "track-1" }); await ship({ carrier: "Carrier", tracking_number: "track-2" });
    expect(mocks.jobs).toHaveLength(2);
    const count = mocks.dispatch.mock.calls.length; await ship({});
    expect(mocks.order?.emailReviewReason).toContain("identity"); expect(mocks.jobs).toHaveLength(2); expect(mocks.dispatch).toHaveBeenCalledTimes(count);
  });
  it("does not enqueue historical shipment email for legacy fulfilled orders", async () => {
    shipmentOrder(); delete mocks.order!.emailPolicyVersion; await ship({ id: 101 });
    expect(mocks.jobs).toHaveLength(0); expect(mocks.dispatch).not.toHaveBeenCalled(); expect(mocks.order?.emailReviewReason).toContain("Legacy");
  });
  it("returns 503 before shipment writes when another order worker owns the lease", async () => {
    shipmentOrder(); mocks.claimOrder.mockResolvedValue({ kind: "busy", retryAfterSeconds: 12 });
    expect((await ship({ id: 101 })).status).toBe(503); expect(mocks.writeOrder).not.toHaveBeenCalled(); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
