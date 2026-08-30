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
  it("blocks the 31st shipping rate request from one client", async () => {
    let response: Response | undefined;

    for (let attempt = 0; attempt < 31; attempt += 1) {
      response = await shippingRatesPost(invalidRequest("http://localhost/api/shipping/rates", "203.0.113.10"));
    }

    expect(response?.status).toBe(429);
  });

  it("blocks the 11th checkout request from one client", async () => {
    let response: Response | undefined;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await checkoutPost(invalidRequest("http://localhost/api/checkout", "203.0.113.11"));
    }

    expect(response?.status).toBe(429);
  });
});
