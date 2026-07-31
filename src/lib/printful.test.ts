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
});
