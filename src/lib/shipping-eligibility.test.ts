import { describe, expect, it } from "vitest";
import { evaluateShippingEligibility, isEuCustomsGuardCountry, ShippingEligibilityError } from "./shipping-eligibility";
import { readShippingRiskRates, type ShippingRiskRate } from "./printful-shipping-risk";
import { safePayload, mixedPayload } from "./__fixtures__/printful-shipping-risk";
import type { OrderItem, ShippingRate } from "./types";

const item: OrderItem = { productId: "p", productName: "Tee", syncVariantId: 1, variantId: 15114, variantName: "S", quantity: 1, currency: "usd", unitAmount: 3999 };
const rates: ShippingRate[] = [{ id: "STANDARD", name: "Standard", rate: "4.99", currency: "USD" }];
const safe = () => readShippingRiskRates(safePayload);
const decide = (risk: ShippingRiskRate[], cart = [item], options = rates) => evaluateShippingEligibility("ES", cart, options, risk);
describe("shipping eligibility", () => {
  it.each(["ES", "FR", "DE", "IT", "PT", " es "])("allows explicitly safe complete %s options without changing prices", country => {
    expect(isEuCustomsGuardCountry(country)).toBe(true);
    expect(evaluateShippingEligibility(country, [item], rates, safe())).toEqual([{ rateId: "STANDARD", status: "eligible" }]);
    expect(rates[0].rate).toBe("4.99");
  });
  it("preserves US without needing risk evidence", () => {
    expect(isEuCustomsGuardCountry("US")).toBe(false);
    expect(evaluateShippingEligibility("US", [item], rates, [])).toEqual([{ rateId: "STANDARD", status: "eligible" }]);
  });
  it("checks every package in a mixed cart", () => {
    expect(decide(readShippingRiskRates(mixedPayload), [item, { ...item, variantId: 15182 }])).toEqual([{ rateId: "STANDARD", status: "customs_risk" }]);
  });
  it.each(["absent", "null", "string", "empty", "missing", "extra", "short", "excess", "zero", "fraction", "currency", "duplicate-v2", "invalid"])("does not allow unverifiable evidence: %s", kind => {
    const risk = safe();
    const shipment = risk[0].shipments[0];
    if (kind === "absent") risk.pop();
    if (kind === "null") shipment.customsFeesPossible = null;
    if (kind === "string") shipment.customsFeesPossible = "false" as unknown as boolean;
    if (kind === "empty") risk[0].shipments = [];
    if (kind === "missing") shipment.items = [];
    if (kind === "extra") shipment.items.push({ variantId: 999, quantity: 1 });
    if (kind === "short") shipment.items[0].variantId = 999;
    if (kind === "excess") shipment.items[0].quantity = 2;
    if (kind === "zero") shipment.items[0].quantity = 0;
    if (kind === "fraction") shipment.items[0].quantity = 0.5;
    if (kind === "currency") risk[0].currency = "eur";
    if (kind === "duplicate-v2") risk.push(structuredClone(risk[0]));
    if (kind === "invalid") risk[0].valid = false;
    expect(decide(risk)[0].status).toBe("unverified");
  });
  it("rejects ambiguous v1 IDs even when differently cased", () => {
    expect(decide(safe(), [item], [...rates, { ...rates[0], id: " standard " }]).every(x => x.status === "unverified")).toBe(true);
  });
  it("aggregates repeated variants across lines and packages", () => {
    const risk = safe();
    risk[0].shipments.push(structuredClone(risk[0].shipments[0]));
    expect(decide(risk, [item, item])[0].status).toBe("eligible");
  });
  it("does not infer customs risk from country and normalizes IDs/currency", () => {
    const risk = safe();
    risk[0].id = " standard "; risk[0].currency = " USD ";
    risk[0].shipments[0].departureCountry = null;
    expect(decide(risk)[0].status).toBe("eligible");
  });
  it("distinguishes safe and risky methods without mutating inputs", () => {
    const risk = safe(); risk.push({ ...structuredClone(risk[0]), id: "EXPRESS" });
    risk[1].shipments[0].customsFeesPossible = true;
    expect(decide(risk, [item], [...rates, { ...rates[0], id: "EXPRESS" }]).map(x => x.status)).toEqual(["eligible", "customs_risk"]);
  });
  it.each([["EU_CUSTOMS_RISK", 409], ["SHIPPING_CHECK_UNAVAILABLE", 503], ["SHIPPING_OPTIONS_CHANGED", 409]] as const)("reports %s with the correct HTTP status", (code, status) => {
    expect(new ShippingEligibilityError(code)).toMatchObject({ code, status });
  });
});
