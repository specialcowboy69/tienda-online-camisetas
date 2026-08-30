import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreOrder } from "./types";

const order: StoreOrder = {
  id: "737c2156ef584a17a5736185195dd42b",
  status: "printful_confirmed",
  recipient: {
    name: "Ada Cliente",
    email: "ada@example.com",
    address1: "Calle Test 1",
    city: "Madrid",
    countryCode: "ES",
    zip: "28001"
  },
  items: [
    {
      productId: "453103125",
      productName: "Camiseta Test",
      syncVariantId: 5419713597,
      variantId: 12634,
      variantName: "Camiseta Test / Maroon / S",
      quantity: 1,
      unitAmount: 2499,
      currency: "eur"
    }
  ],
  shippingRate: { id: "STANDARD", name: "Standard", rate: "4.29", currency: "EUR" },
  totals: { subtotal: 2499, shipping: 429, total: 2928, currency: "eur" },
  createdAt: "2026-08-29T10:00:00.000Z",
  updatedAt: "2026-08-29T10:00:00.000Z"
};

describe("transactional emails", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Tienda Online Camisetas <orders@example.com>");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends order confirmations through Resend with idempotency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendOrderConfirmationEmail } = await import("./email");
    await sendOrderConfirmationEmail(order);

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
      from: "Tienda Online Camisetas <orders@example.com>",
      to: "ada@example.com",
      subject: "Pedido #737C2156 confirmado",
      tags: [{ name: "email_type", value: "order_confirmation" }]
    });
    expect(body.text).toContain("Hemos recibido tu pago");
    expect(body.html).toContain("Pedido confirmado");
  });
});
