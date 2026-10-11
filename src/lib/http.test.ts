import { describe, expect, it } from "vitest";
import { jsonError, summarizeError } from "./http";
import { ShippingEligibilityError } from "./shipping-eligibility";

it.each([["EU_CUSTOMS_RISK", 409], ["SHIPPING_CHECK_UNAVAILABLE", 503], ["SHIPPING_OPTIONS_CHANGED", 409]] as const)("returns sanitized %s business errors", async (code, status) => {
  const error = Object.assign(new ShippingEligibilityError(code), { details: { token: "private" } });
  const response = jsonError(error);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: error.message, code });
});

class ApiError extends Error {
  status = 400;
  details = { code: 400, result: "Invalid sync variant" };

  constructor() {
    super("Request failed");
    this.name = "ApiError";
  }
}

describe("summarizeError", () => {
  it("preserves API status and details from custom errors", () => {
    expect(summarizeError(new ApiError())).toEqual({
      type: "ApiError",
      message: "Request failed",
      status: 400,
      details: { code: 400, result: "Invalid sync variant" }
    });
  });
});
