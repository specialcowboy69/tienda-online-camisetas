import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ProcessingBusyError, ProcessingOwnershipLostError } from "./processing-errors";

const mocks = vi.hoisted(() => ({ handleStripeWebhook: vi.fn() }));
vi.mock("@/lib/order-service", () => ({ handleStripeWebhook: mocks.handleStripeWebhook }));

describe("Stripe webhook route processing failures", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["busy", "lost"])("returns 503 with Retry-After for %s ownership", async (kind) => {
    const error = kind === "busy" ? new ProcessingBusyError(19) : new ProcessingOwnershipLostError();
    mocks.handleStripeWebhook.mockRejectedValue(error);
    const { POST } = await import("../app/api/webhooks/stripe/route");
    const response = await POST(new NextRequest("https://store.example/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe(kind === "busy" ? "19" : "1");
  });
  it("keeps an ordinary processing failure at 500", async () => {
    mocks.handleStripeWebhook.mockRejectedValue(new Error("ordinary failure"));
    const { POST } = await import("../app/api/webhooks/stripe/route");
    expect((await POST(new NextRequest("https://store.example/api/webhooks/stripe", { method: "POST", body: "{}" }))).status).toBe(500);
  });
});
