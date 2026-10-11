export type ShippingRiskItem = { variantId: number; quantity: number };
export type ShippingRiskShipment = {
  departureCountry: string | null;
  items: ShippingRiskItem[];
  customsFeesPossible: boolean | null;
};
export type ShippingRiskRate = { id: string; currency: string; shipments: ShippingRiskShipment[]; valid: boolean };
export type ShippingRiskPlacement = { placement: "front_dtf"; technique: "dtfilm" };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// Treat external JSON as untrusted. Unknown evidence must never become "false".
export function readShippingRiskRates(payload: unknown): ShippingRiskRate[] {
  const root = record(payload);
  if (!root || !Array.isArray(root.data)) throw new Error("Invalid shipping risk envelope.");
  return root.data.map(value => {
    const rate = record(value);
    const id = typeof rate?.shipping === "string" ? rate.shipping.trim().toUpperCase() : "";
    const currency = typeof rate?.currency === "string" ? rate.currency.trim().toLowerCase() : "";
    let valid = Boolean(id && /^[a-z]{3}$/.test(currency) && Array.isArray(rate?.shipments) && rate.shipments.length > 0);
    const shipments = (Array.isArray(rate?.shipments) ? rate.shipments : []).map(value => {
      const shipment = record(value);
      if (!shipment || !Array.isArray(shipment.shipment_items) || !shipment.shipment_items.length) valid = false;
      const items = (Array.isArray(shipment?.shipment_items) ? shipment.shipment_items : []).map(value => {
        const item = record(value);
        if (!positiveInteger(item?.catalog_variant_id) || !positiveInteger(item?.quantity)) valid = false;
        return { variantId: item?.catalog_variant_id as number, quantity: item?.quantity as number };
      });
      return {
        departureCountry: typeof shipment?.departure_country === "string" ? shipment.departure_country : null,
        items,
        customsFeesPossible: typeof shipment?.customs_fees_possible === "boolean" ? shipment.customs_fees_possible : null
      };
    });
    return { id, currency, shipments, valid };
  });
}
