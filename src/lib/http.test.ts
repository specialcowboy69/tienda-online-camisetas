import { describe, expect, it } from "vitest";
import { summarizeError } from "./http";

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
