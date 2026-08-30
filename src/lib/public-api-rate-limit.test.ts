import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as checkoutPost } from "../app/api/checkout/route";
import { POST as shippingRatesPost } from "../app/api/shipping/rates/route";

function invalidRequest(url: string, ip: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: "{}"
  });
}

describe("public API rate limits", () => {
  it("uses a broader fallback bucket when shipping cannot identify the client", async () => {
    let response: Response | undefined;

    for (let attempt = 0; attempt < 31; attempt += 1) {
      response = await shippingRatesPost(invalidRequest("http://localhost/api/shipping/rates", "203.0.113.10"));
    }

    expect(response?.status).toBe(400);
  });

  it("uses a broader fallback bucket when checkout cannot identify the client", async () => {
    let response: Response | undefined;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await checkoutPost(invalidRequest("http://localhost/api/checkout", "203.0.113.11"));
    }

    expect(response?.status).toBe(400);
  });
});
