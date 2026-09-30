import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreOrder } from "./types";

const order: StoreOrder = {
  id: "737c2156ef584a17a5736185195dd42b",
  status: "printful_confirmed",
  recipient: {
    name: "Ada Customer",
    email: "ada@example.com",
    address1: "1 Test Street",
    city: "New York",
    stateCode: "NY",
    countryCode: "US",
    zip: "10001"
  },
  items: [
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
  ],
  shippingRate: { id: "STANDARD", name: "Standard", rate: "4.29", currency: "USD" },
  totals: { subtotal: 2499, shipping: 429, total: 2928, currency: "usd" },
  createdAt: "2026-08-29T10:00:00.000Z",
  updatedAt: "2026-08-29T10:00:00.000Z"
};

describe("transactional emails", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "No Context Club <orders@example.com>");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends order confirmations through Resend with idempotency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail, renderOrderConfirmationEmail } = await import("./email");
    await expect(sendEmail({ ...renderOrderConfirmationEmail(order), from: "No Context Club <orders@example.com>" }, `order-confirmation-${order.id}`)).resolves.toEqual({ kind: "accepted", providerEmailId: "email-id" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test",
          "Idempotency-Key": `order-confirmation-${order.id}`
        })
      })
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "No Context Club <orders@example.com>",
      to: "ada@example.com",
      subject: "Order #737C2156 confirmed",
      tags: [{ name: "email_type", value: "order_confirmation" }]
    });
    expect(body.text).toContain("We've received your payment");
    expect(body.text).toContain("Total: $29.28");
    expect(body.html).toContain("Order confirmed");
  });

  it("requires a provider receipt and never persists raw provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const email = await import("./email");
    await expect(email.sendEmail({ ...email.renderOrderConfirmationEmail(order), from: "orders@example.com" }, "key")).rejects.toThrow("receipt");
  });

  it("reports missing configuration as blocked without making HTTP calls", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const http = vi.fn(); vi.stubGlobal("fetch", http);
    const email = await import("./email");
    expect(await email.sendEmail(email.renderOrderConfirmationEmail(order), "key")).toEqual({ kind: "blocked", reason: "missing_configuration" });
    expect(http).not.toHaveBeenCalled();
  });
  it("aborts the request at 20 seconds including response body consumption", async () => {
    vi.useFakeTimers();
    try {
      const http = vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: () => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout")))) }));
      vi.stubGlobal("fetch", http);
      const { sendEmail, renderOrderConfirmationEmail } = await import("./email");
      const result = sendEmail({ ...renderOrderConfirmationEmail(order), from: "frozen@example.com" }, "key");
      const rejected = expect(result).rejects.toThrow("receipt");
      await vi.advanceTimersByTimeAsync(19999); expect(http.mock.calls[0][1].signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1); await rejected;
      expect(http.mock.calls[0][1].signal.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
