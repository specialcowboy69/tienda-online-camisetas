import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  beginWebhookEventProcessing: vi.fn(),
  configurePrintfulWebhook: vi.fn(),
  isAdminRequest: vi.fn(),
  listCatalogProducts: vi.fn(),
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

vi.mock("@/lib/email", () => ({
  sendShipmentEmail: vi.fn()
}));

vi.mock("@/lib/firestore", () => ({
  beginWebhookEventProcessing: mocks.beginWebhookEventProcessing,
  failWebhookEventProcessing: vi.fn(),
  finishWebhookEventProcessing: vi.fn(),
  findOrderByPrintfulExternalId: vi.fn(),
  getOrder: vi.fn(),
  listCatalogProducts: mocks.listCatalogProducts,
  markCatalogProductDeleted: vi.fn(),
  saveCatalogProducts: vi.fn(),
  updateOrderStatus: vi.fn()
}));

vi.mock("@/lib/http", () => ({
  jsonError: vi.fn(),
  summarizeError: vi.fn()
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

vi.mock("@/lib/printful-webhook", () => ({
  isPrintfulWebhookSecretValid: (value: string | null) => value === "strong-test-secret",
  parsePrintfulWebhookPayload: (input: unknown) => input
}));

describe("Printful webhook routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PRINTFUL_WEBHOOK_SECRET", "strong-test-secret");
    mocks.webhookSecret = "strong-test-secret";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
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
    mocks.beginWebhookEventProcessing.mockResolvedValue(false);
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
    mocks.beginWebhookEventProcessing.mockResolvedValue(false);
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
});
