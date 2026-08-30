import { z } from "zod";
import { env } from "./env";

const trackingUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((url) => {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Tracking URL must use HTTP or HTTPS.");

export const printfulWebhookPayloadSchema = z.object({
  type: z.string().min(1).max(80),
  created: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  store: z.number().int().nonnegative(),
  data: z
    .object({
      order: z
        .object({
          id: z.number().int().optional(),
          external_id: z.string().max(128).optional(),
          status: z.string().max(80).optional()
        })
        .optional(),
      shipment: z
        .object({
          id: z.number().int().optional(),
          carrier: z.string().max(80).optional(),
          service: z.string().max(80).optional(),
          tracking_number: z.string().max(120).optional(),
          tracking_url: trackingUrlSchema.optional()
        })
        .optional(),
      sync_product: z
        .object({
          id: z.number().int().optional(),
          external_id: z.string().max(128).optional(),
          name: z.string().max(200).optional()
        })
        .optional(),
      product_id: z.number().int().optional(),
      reason: z.string().max(500).optional()
    })
    .optional()
});

export type PrintfulWebhookPayload = z.infer<typeof printfulWebhookPayloadSchema>;

export function isPrintfulWebhookSecretValid(value: string | null): boolean {
  return Boolean(env.PRINTFUL_WEBHOOK_SECRET && value === env.PRINTFUL_WEBHOOK_SECRET);
}

export function parsePrintfulWebhookPayload(input: unknown): PrintfulWebhookPayload {
  return printfulWebhookPayloadSchema.parse(input);
}
