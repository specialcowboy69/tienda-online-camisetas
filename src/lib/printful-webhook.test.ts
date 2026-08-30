import { afterEach, describe, expect, it, vi } from "vitest";

describe("Printful webhook protection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects webhook requests when the configured secret is missing from the request", async () => {
    vi.stubEnv("PRINTFUL_WEBHOOK_SECRET", "strong-test-secret");
    const { isPrintfulWebhookSecretValid } = await import("./printful-webhook");

    expect(isPrintfulWebhookSecretValid(null)).toBe(false);
    expect(isPrintfulWebhookSecretValid("wrong")).toBe(false);
    expect(isPrintfulWebhookSecretValid("strong-test-secret")).toBe(true);
  });

  it("parses valid payloads and rejects invalid tracking URLs", async () => {
    const { parsePrintfulWebhookPayload } = await import("./printful-webhook");

    expect(
      parsePrintfulWebhookPayload({
        type: "package_shipped",
        created: 123,
        retries: 0,
        store: 18536834
      })
    ).toMatchObject({ type: "package_shipped", store: 18536834 });

    expect(() =>
      parsePrintfulWebhookPayload({
        type: "package_shipped",
        created: 123,
        retries: 0,
        store: 18536834,
        data: {
          shipment: {
            tracking_url: "javascript:alert(1)"
          }
        }
      })
    ).toThrow();
  });
});
