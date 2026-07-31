import { z } from "zod";
import { getAllowedShippingCountries } from "./env";

export const recipientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  address1: z.string().min(3),
  address2: z.string().optional(),
  city: z.string().min(2),
  stateCode: z.string().optional(),
  countryCode: z.string().length(2).transform((value) => value.toUpperCase()),
  zip: z.string().min(2)
});

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  syncVariantId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100)
});

export const shippingRatesRequestSchema = z.object({
  recipient: recipientSchema,
  items: z.array(cartItemSchema).min(1).max(100)
});

export const checkoutRequestSchema = shippingRatesRequestSchema.extend({
  shippingRateId: z.string().min(1)
});

export function assertAllowedCountry(countryCode: string): void {
  const allowed = getAllowedShippingCountries();
  if (!allowed.includes(countryCode.toUpperCase())) {
    throw new Error(`Shipping country ${countryCode} is not enabled for this store.`);
  }
}
