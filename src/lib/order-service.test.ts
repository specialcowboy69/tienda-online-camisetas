import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogProduct, ShippingRate } from "./types";

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getCatalogProduct: vi.fn(),
  getShippingRates: vi.fn(),
  createStripeCheckoutSession: vi.fn()
}));

vi.mock("./firestore", () => ({
  beginWebhookEventProcessing: vi.fn(),
  createOrder: mocks.createOrder,
  failWebhookEventProcessing: vi.fn(),
  finishWebhookEventProcessing: vi.fn(),
  findOrderByPrintfulExternalId: vi.fn(),
  findOrderByStripePaymentIntentId: vi.fn(),
  getCatalogProduct: mocks.getCatalogProduct,
  getOrder: vi.fn(),
  updateOrder: vi.fn(),
  updateOrderStatus: vi.fn()
}));

vi.mock("./printful", () => ({
  PrintfulApiError: class PrintfulApiError extends Error {
    status = 500;
    details: unknown;

    get isTemporary() {
      return false;
    }
  },
  createPrintfulOrder: vi.fn(),
  findPrintfulOrderByExternalId: vi.fn(),
  getPrintfulExternalId: vi.fn(),
  getShippingRates: mocks.getShippingRates
}));

vi.mock("./stripe", () => ({
  createStripeCheckoutSession: mocks.createStripeCheckoutSession,
  getStripe: vi.fn()
}));

vi.mock("./email", () => ({
  sendOrderConfirmationEmail: vi.fn()
}));

const product: CatalogProduct = {
  id: "101",
  syncProductId: 101,
  name: "Test Shirt",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [
    {
      syncVariantId: 201,
      variantId: 301,
      name: "Black / L",
      retailPrice: "25.50",
      currency: "eur",
      availabilityStatus: "active"
    }
  ]
};

const shippingRate: ShippingRate = {
  id: "STANDARD",
  name: "Standard",
  rate: "4.95",
  currency: "EUR"
};

describe("order service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCatalogProduct.mockResolvedValue(product);
    mocks.getShippingRates.mockResolvedValue([shippingRate]);
    mocks.createStripeCheckoutSession.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test" });
  });

  it("creates United States checkouts with a Printful shipping method but no customer shipping charge", async () => {
    const { createCheckout } = await import("./order-service");

    const result = await createCheckout({
      recipient: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        address1: "1 Test Street",
        city: "New York",
        stateCode: "NY",
        countryCode: "US",
        zip: "10001"
      },
      items: [{ productId: "101", syncVariantId: 201, quantity: 1 }],
      shippingRateId: "STANDARD"
    });

    expect(result.order.shippingRate).toMatchObject({ id: "STANDARD", rate: "0.00" });
    expect(result.order.totals).toMatchObject({
      subtotal: 2550,
      shipping: 0,
      total: 2550,
      currency: "eur"
    });
    expect(mocks.createOrder.mock.calls[0][0].totals.shipping).toBe(0);
    expect(mocks.createStripeCheckoutSession.mock.calls[0][0].totals.shipping).toBe(0);
  });
});
