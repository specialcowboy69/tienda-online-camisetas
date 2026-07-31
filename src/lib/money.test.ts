import { describe, expect, it } from "vitest";
import { assertSameCurrency, fromMinorUnits, toMinorUnits } from "./money";

describe("money", () => {
  it("converts decimal currencies to minor units", () => {
    expect(toMinorUnits("19.99", "EUR")).toBe(1999);
    expect(fromMinorUnits(1999, "EUR")).toBe("19.99");
  });

  it("handles zero decimal currencies", () => {
    expect(toMinorUnits("1200", "JPY")).toBe(1200);
    expect(fromMinorUnits(1200, "JPY")).toBe("1200");
  });

  it("rejects mixed checkout currencies", () => {
    expect(() => assertSameCurrency(["EUR", "USD"])).toThrow("multiple currencies");
  });
});
