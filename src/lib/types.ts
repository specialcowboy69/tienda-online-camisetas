export type OrderStatus =
  | "draft"
  | "checkout_created"
  | "paid"
  | "printful_pending"
  | "printful_confirmed"
  | "shipped"
  | "returned"
  | "failed"
  | "refunded"
  | "manual_review"
  | "expired"
  | "canceled";

export type Recipient = {
  name: string;
  email: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  stateCode?: string;
  countryCode: string;
  zip: string;
};

export type CatalogVariant = {
  syncVariantId: number;
  variantId: number;
  name: string;
  size?: string;
  color?: string;
  retailPrice: string;
  currency: string;
  image?: string;
  availabilityStatus?: string;
  isIgnored?: boolean;
};

export type CatalogProduct = {
  id: string;
  syncProductId: number;
  externalId?: string;
  name: string;
  storefrontImage?: string;
  storefrontImages?: string[];
  thumbnail?: string;
  variants: CatalogVariant[];
  isIgnored?: boolean;
  synced?: number;
  updatedAt: string;
};

export type CartItemInput = {
  productId: string;
  syncVariantId: number;
  quantity: number;
};

export type OrderItem = {
  productId: string;
  productName: string;
  syncVariantId: number;
  variantId: number;
  variantName: string;
  size?: string;
  color?: string;
  image?: string;
  quantity: number;
  unitAmount: number;
  currency: string;
};

export type ShippingRate = {
  id: string;
  name: string;
  rate: string;
  currency: string;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
  minDeliveryDate?: string;
  maxDeliveryDate?: string;
};

export type OrderTotals = {
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
};

export type CheckoutValidationEvidence = {
  version: 1;
  validatedAt: string;
  source: "stripe_webhook" | "admin_revalidation";
  stripeSessionId: string;
  stripePaymentIntentId: string;
  paidAmount: number;
  currency: string;
  taxAmount: number;
  stripeTaxEnabled: boolean;
  orderSnapshotHash: string;
};

export type StoreOrder = {
  id: string;
  status: OrderStatus;
  recipient: Recipient;
  items: OrderItem[];
  shippingRate: ShippingRate;
  totals: OrderTotals;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeAmountTotal?: number;
  stripeTaxAmount?: number;
  checkoutValidation?: CheckoutValidationEvidence;
  orderProcessingLease?: ProcessingLease;
  emailPolicyVersion?: 1;
  emailReviewReason?: string;
  printfulOrderId?: number;
  printfulExternalId?: string;
  printfulStatus?: string;
  tracking?: {
    carrier?: string;
    service?: string;
    trackingNumber?: string;
    trackingUrl?: string;
  };
  error?: {
    type: string;
    message: string;
    status?: number;
    details?: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export type WebhookSource = "stripe" | "printful";

export type EmailMessage = { from?: string; to: string; subject: string; text: string; html: string; tags: Array<{ name: string; value: string }> };
export type EmailJob = {
  id: string; orderId: string; kind: "order_confirmation" | "shipment";
  message: EmailMessage; idempotencyKey: string;
  status: "pending" | "processing" | "blocked" | "accepted" | "manual_review";
  attempts: number; firstDispatchAtMs?: number; providerEmailId?: string;
  lease?: ProcessingLease; lastError?: string; createdAt: string; updatedAt: string;
};

export type ProcessingLease = { token: string; expiresAtMs: number };
export type ClaimResult<T> =
  | { kind: "claimed"; lease: ProcessingLease; value: T }
  | { kind: "busy"; retryAfterSeconds: number };
