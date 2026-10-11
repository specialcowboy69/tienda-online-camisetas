import type { OrderItem, ShippingRate } from "./types";
import type { ShippingRiskItem, ShippingRiskRate } from "./printful-shipping-risk";

export type ShippingEligibilityStatus = "eligible" | "customs_risk" | "unverified";
export type ShippingRateDecision = { rateId: string; status: ShippingEligibilityStatus };
export type ShippingEligibilityCode = "EU_CUSTOMS_RISK" | "SHIPPING_CHECK_UNAVAILABLE" | "SHIPPING_OPTIONS_CHANGED";

const messages: Record<ShippingEligibilityCode, string> = {
  EU_CUSTOMS_RISK: "This selection is currently unavailable for delivery to your address because import charges may apply. Try a different size, color or product, then check shipping again.",
  SHIPPING_CHECK_UNAVAILABLE: "We couldn't verify delivery availability for this selection. Please check shipping again in a moment.",
  SHIPPING_OPTIONS_CHANGED: "Shipping options have changed. Please check shipping again before paying."
};
export class ShippingEligibilityError extends Error {
  readonly status: 409 | 503;
  constructor(readonly code: ShippingEligibilityCode) {
    super(messages[code]);
    this.name = "ShippingEligibilityError";
    this.status = code === "SHIPPING_CHECK_UNAVAILABLE" ? 503 : 409;
  }
}
export function isEuCustomsGuardCountry(countryCode: string): boolean {
  return ["ES", "FR", "DE", "IT", "PT"].includes(countryCode.trim().toUpperCase());
}
const methodId = (id: string) => id.trim().toUpperCase();
const currencyId = (currency: string) => currency.trim().toLowerCase();
function quantities(items: ShippingRiskItem[]): Map<number, number> | null {
  if (!items.length) return null;
  const result = new Map<number, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.variantId) || item.variantId <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) return null;
    const total = (result.get(item.variantId) || 0) + item.quantity;
    if (!Number.isSafeInteger(total)) return null;
    result.set(item.variantId, total);
  }
  return result;
}
export function evaluateShippingEligibility(countryCode: string, items: OrderItem[], rates: ShippingRate[], riskRates: ShippingRiskRate[]): ShippingRateDecision[] {
  const guarded = isEuCustomsGuardCountry(countryCode);
  const requested = quantities(items);
  return rates.map(rate => {
    const decision = (status: ShippingEligibilityStatus) => ({ rateId: rate.id, status });
    if (!guarded) return decision("eligible");
    const matching = riskRates.filter(risk => methodId(risk.id) === methodId(rate.id));
    if (!methodId(rate.id) || rates.filter(other => methodId(other.id) === methodId(rate.id)).length !== 1 || matching.length !== 1) return decision("unverified");
    const risk = matching[0];
    if (!requested || !risk.valid || currencyId(risk.currency) !== currencyId(rate.currency) || !risk.shipments.length) return decision("unverified");
    if (risk.shipments.some(shipment => !shipment.items.length || typeof shipment.customsFeesPossible !== "boolean")) return decision("unverified");
    const actual = quantities(risk.shipments.flatMap(shipment => shipment.items));
    if (!actual || actual.size !== requested.size || [...requested].some(([id, quantity]) => actual.get(id) !== quantity)) return decision("unverified");
    return decision(risk.shipments.some(shipment => shipment.customsFeesPossible === true) ? "customs_risk" : "eligible");
  });
}
