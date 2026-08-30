import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_TAX_ENABLED: z.string().optional(),
  PRINTFUL_API_TOKEN: z.string().optional(),
  PRINTFUL_STORE_ID: z.string().optional(),
  PRINTFUL_WEBHOOK_SECRET: z.string().optional(),
  ORDER_CONFIRM_PRINTFUL: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  ALLOWED_SHIPPING_COUNTRIES: z.string().default("ES,FR,DE,IT,PT,US,CA,GB"),
  PRINTFUL_WEBHOOK_TYPES: z.string().optional(),
  ADMIN_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional()
});

export const env = envSchema.parse(process.env);

export function requiredEnv(name: keyof typeof env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value);
}

export function getAllowedShippingCountries(): string[] {
  return env.ALLOWED_SHIPPING_COUNTRIES.split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}

export function isStripeTaxEnabled(): boolean {
  return env.STRIPE_TAX_ENABLED === "true";
}

export function shouldConfirmPrintfulOrders(): boolean {
  return env.ORDER_CONFIRM_PRINTFUL === "true";
}

export function getBaseUrl(): string {
  return env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
}

export function getPrintfulWebhookTypes(): string[] {
  return (
    env.PRINTFUL_WEBHOOK_TYPES ||
    "package_shipped,package_returned,order_created,order_canceled,order_put_hold,order_remove_hold,stock_updated,product_updated,product_deleted"
  )
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
}
