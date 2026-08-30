import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as checkoutPost } from "../app/api/checkout/route";
import { POST as shippingRatesPost } from "../app/api/shipping/rates/route";

const oversizedJson = JSON.stringify({ ignored: "x".repeat(65 * 1024) });

function streamingBody(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}

describe("public API request body limits", () => {
  it("rejects an oversized declared shipping request before parsing JSON", async () => {
    const response = await shippingRatesPost(
      new NextRequest("http://localhost/api/shipping/rates", {
        method: "POST",
        headers: { "content-length": String(oversizedJson.length) },
        body: oversizedJson
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large" });
  });

  it("rejects an oversized streamed checkout request without Content-Length", async () => {
    const response = await checkoutPost(
      new NextRequest("http://localhost/api/checkout", {
        method: "POST",
        body: streamingBody(oversizedJson)
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large" });
  });
});
