// Sanitized real read-only Printful responses, 2026-10-11.
// Sources: /store/products/{id}, /v2/catalog-products/{id}, /v2/shipping-rates.
// Omitted personal recipient fields, private artwork URLs, pricing/dates not used by risk.
export const syncDtfFixture = {
  result: {
    sync_product: { id: 468682936 },
    sync_variants: [
      { id: 5489215132, variant_id: 15114, files: [{ type: "front_dtf" }, { type: "preview" }] },
      { id: 5489218795, variant_id: 15182, files: [{ type: "front_dtf" }, { type: "preview" }] }
    ]
  }
};
export const safePayload = { data: [{
  shipping: "STANDARD", currency: "USD",
  shipments: [{ departure_country: "LV", shipment_items: [{ catalog_variant_id: 15114, quantity: 1 }], customs_fees_possible: false }]
}] };
export const riskyPayload = { data: [{
  shipping: "STANDARD", currency: "USD",
  shipments: [{ departure_country: "US", shipment_items: [{ catalog_variant_id: 15182, quantity: 1 }], customs_fees_possible: true }]
}] };
// Composition of the two real shipments above; explicitly synthetic until refreshed.
export const mixedPayload = { data: [{
  shipping: "STANDARD", currency: "USD",
  shipments: [...safePayload.data[0].shipments, ...riskyPayload.data[0].shipments]
}] };
